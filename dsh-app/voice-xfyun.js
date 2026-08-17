// ============================================================
//  讯飞「录音文件转写极速版」客户端（纯 Node CJS，零外部依赖）
//  供 Electron 主进程（main.js）与独立测试脚本共用。
//
//  流程：① multipart 上传音频文件 → 获得文件 URL；
//        ② 创建转写任务（pro_create）→ 获得 task_id；
//        ③ 轮询查询（query）直至转写完成 → 拼装识别文本。
//
//  鉴权：HMAC-SHA256 签名。签名串由四要素构成：
//        host / date(RFC1123 GMT) / request-line / digest，
//        APISecret 做 HMAC 密钥，APIKey 放入 Authorization 头。
//  接口（见 https://www.xfyun.cn/doc/asr/speedTranscription/API.html）：
//        https://upload-ost-api.xfyun.cn/file/upload    （小文件上传，<30M）
//        https://ost-api.xfyun.cn/v2/ost/pro_create     （创建任务）
//        https://ost-api.xfyun.cn/v2/ost/query          （查询任务）
// ============================================================
'use strict';

const https = require('https');
const crypto = require('crypto');

const UPLOAD_HOST = 'upload-ost-api.xfyun.cn';
const OST_HOST = 'ost-api.xfyun.cn';
const UPLOAD_PATH = '/file/upload';
const CREATE_PATH = '/v2/ost/pro_create';
const QUERY_PATH = '/v2/ost/query';

/** 生成 RFC1123 GMT 时间串（如 "Wed, 05 Jan 2022 09:29:14 GMT"）。 */
function rfc1123Date() {
  return new Date().toUTCString();
}

/** 对给定请求体计算 Digest 头与 Authorization 头（HMAC-SHA256 签名）。 */
function buildAuthHeaders(host, date, method, path, bodyBuffer, apiKey, apiSecret) {
  const digest = 'SHA-256=' + crypto.createHash('sha256').update(bodyBuffer).digest('base64');
  const signatureOrigin = 'host: ' + host + '\n'
    + 'date: ' + date + '\n'
    + method + ' ' + path + ' HTTP/1.1\n'
    + 'digest: ' + digest;
  const signature = crypto.createHmac('sha256', String(apiSecret))
    .update(signatureOrigin).digest('base64');
  const authorization = 'api_key="' + String(apiKey) + '", algorithm="hmac-sha256", '
    + 'headers="host date request-line digest", signature="' + signature + '"';
  return { digest, authorization };
}

/**
 * 发送一个带签名头的 HTTPS POST。
 * @param {string} host - 请求主机（签名要素之一）。
 * @param {string} path - 请求路径（签名要素之一）。
 * @param {Buffer} bodyBuffer - 请求体（Digest 按它计算）。
 * @param {string} contentType - Content-Type 头。
 * @param {string} apiKey - 讯飞 APIKey。
 * @param {string} apiSecret - 讯飞 APISecret。
 * @param {number} timeoutMs - 请求超时（毫秒）。
 * @returns {Promise<{status:number, body:string, error?:string}>}
 */
function signedPost(host, path, bodyBuffer, contentType, apiKey, apiSecret, timeoutMs) {
  return new Promise((resolve) => {
    const date = rfc1123Date();
    const { digest, authorization } = buildAuthHeaders(host, date, 'POST', path, bodyBuffer, apiKey, apiSecret);
    const req = https.request({
      hostname: host,
      path,
      method: 'POST',
      headers: {
        'Host': host,
        'Date': date,
        'Digest': digest,
        'Authorization': authorization,
        'Content-Type': contentType,
        'Content-Length': bodyBuffer.length,
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('timeout', () => { req.destroy(); });
    req.on('error', (err) => { resolve({ status: 0, body: '', error: err.message }); });
    req.write(bodyBuffer);
    req.end();
  });
}

/** 拼装 multipart/form-data 请求体。 */
function buildMultipart(fields, boundary) {
  const parts = [];
  for (const field of fields) {
    let head = '--' + boundary + '\r\n';
    if (field.file) {
      head += 'Content-Disposition: form-data; name="' + field.name + '"; filename="' + field.filename + '"\r\n';
      head += 'Content-Type: ' + field.contentType + '\r\n';
    } else {
      head += 'Content-Disposition: form-data; name="' + field.name + '"\r\n';
    }
    parts.push(Buffer.from(head + '\r\n', 'utf8'));
    parts.push(field.file || Buffer.from(String(field.value), 'utf8'));
    parts.push(Buffer.from('\r\n', 'utf8'));
  }
  parts.push(Buffer.from('--' + boundary + '--\r\n', 'utf8'));
  return Buffer.concat(parts);
}

/** 解析 JSON 响应，解析失败时抛出带原始文本的错误。 */
function parseJson(body, step) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new Error(step + '：响应不是 JSON（' + body.slice(0, 200) + '）');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(step + '：响应格式异常（' + body.slice(0, 200) + '）');
  }
  return parsed;
}

/** 从查询响应中提取识别文本（兼容 result 为对象或 JSON 字符串两种形态）。 */
function extractXfyunText(result) {
  let obj = result;
  if (typeof result === 'string') {
    try { obj = JSON.parse(result); } catch (e) { return ''; }
  }
  if (!obj || typeof obj !== 'object') return '';
  const lattice = Array.isArray(obj.lattice) ? obj.lattice
    : Array.isArray(obj.lattice2) ? obj.lattice2
    : [];
  let text = '';
  for (const segment of lattice) {
    const rt = segment && segment.json_1best && segment.json_1best.st
      ? segment.json_1best.st.rt : null;
    if (!Array.isArray(rt)) continue;
    for (const turn of rt) {
      if (!Array.isArray(turn.ws)) continue;
      for (const word of turn.ws) {
        if (!Array.isArray(word.cw)) continue;
        for (const char of word.cw) {
          if (char && typeof char.w === 'string') text += char.w;
        }
      }
    }
  }
  return text.trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 讯飞录音文件转写极速版全流程。
 * @param {object} options
 * @param {string} options.appId - 讯飞 AppID。
 * @param {string} options.apiKey - 讯飞 APIKey。
 * @param {string} options.apiSecret - 讯飞 APISecret。
 * @param {string} options.wavBase64 - 16kHz/16bit/单声道 WAV 的 base64。
 * @param {object} [options.hooks] - { step?: (name: string) => void } 进度回调。
 * @param {number} [options.pollTimeoutMs] - 轮询总超时（默认 120000）。
 * @returns {Promise<{ok:true,text:string}|{ok:false,error:string}>}
 */
async function transcribeXfyun({ appId, apiKey, apiSecret, wavBase64, hooks, pollTimeoutMs }) {
  const step = (name) => { if (hooks && typeof hooks.step === 'function') hooks.step(name); };
  try {
    const missing = [];
    if (!String(appId || '').trim()) missing.push('AppID');
    if (!String(apiKey || '').trim()) missing.push('APIKey');
    if (!String(apiSecret || '').trim()) missing.push('APISecret');
    if (missing.length > 0) {
      return { ok: false, error: '语音识别参数不完整：缺少 ' + missing.join(' / ')
        + '（请在设置-语音输入中填写 AppID / APIKey / APISecret 三项）' };
    }
    // 凭证格式校验（讯飞控制台分发的格式固定）：APIKey 为 32 位十六进制；
    // APISecret 为 24~80 字符的 base64 风格密文（实测用户凭证为 32 字符）。
    // 两者互换或复制错位时在此拦截并给出可操作的提示，而不是等讯飞返回
    // 晦涩的 401。APISecret 若恰好是纯 32 位十六进制，几乎可以断定填反了。
    if (!/^[0-9a-fA-F]{32}$/.test(apiKey)) {
      return { ok: false, error: 'APIKey 格式异常（应为 32 位十六进制字符）。'
        + '请到讯飞控制台核对，注意 APIKey 与 APISecret 是两个不同的密钥，不要填反。' };
    }
    if (apiSecret.length < 24 || apiSecret.length > 80 || /^[0-9a-fA-F]{32}$/.test(apiSecret)) {
      return { ok: false, error: 'APISecret 格式异常（应为 24~80 字符的密文）。'
        + '请到讯飞控制台核对，注意 APIKey 与 APISecret 是两个不同的密钥，不要填反。' };
    }
    const audio = Buffer.from(String(wavBase64), 'base64');
    if (audio.length === 0) return { ok: false, error: '录音数据为空' };
    const requestId = 'dsh' + Date.now() + crypto.randomBytes(4).toString('hex');

    // ---------- ① 上传音频 ----------
    step('upload');
    const boundary = 'dsh' + crypto.randomBytes(16).toString('hex');
    const uploadBody = buildMultipart([
      { name: 'data', file: audio, filename: 'speech.wav', contentType: 'audio/wav' },
      { name: 'app_id', value: appId },
      { name: 'request_id', value: requestId },
    ], boundary);
    const uploadRes = await signedPost(
      UPLOAD_HOST, UPLOAD_PATH, uploadBody,
      'multipart/form-data; boundary=' + boundary, apiKey, apiSecret, 30000,
    );
    if (uploadRes.status === 0) {
      return { ok: false, error: '上传失败：网络错误（' + uploadRes.error + '）' };
    }
    if (uploadRes.status !== 200) {
      return { ok: false, error: '上传失败：HTTP ' + uploadRes.status + ' ' + uploadRes.body.slice(0, 200) };
    }
    const uploadParsed = parseJson(uploadRes.body, '上传响应');
    if (uploadParsed.code !== 0) {
      return { ok: false, error: '上传失败：code=' + uploadParsed.code + ' ' + (uploadParsed.message || '') };
    }
    const fileUrl = uploadParsed.data && uploadParsed.data.url;
    if (!fileUrl) return { ok: false, error: '上传成功但未返回文件地址' };

    // ---------- ② 创建转写任务 ----------
    step('create');
    const createBody = JSON.stringify({
      common: { app_id: appId },
      business: {
        request_id: requestId,
        language: 'zh_cn',
        domain: 'pro_ost_ed',
        accent: 'mandarin',
      },
      data: {
        audio_url: fileUrl,
        audio_src: 'http',
        encoding: 'raw',
      },
    });
    const createRes = await signedPost(
      OST_HOST, CREATE_PATH, Buffer.from(createBody, 'utf8'),
      'application/json', apiKey, apiSecret, 20000,
    );
    if (createRes.status === 0) {
      return { ok: false, error: '创建任务失败：网络错误（' + createRes.error + '）' };
    }
    if (createRes.status !== 200) {
      return { ok: false, error: '创建任务失败：HTTP ' + createRes.status + ' ' + createRes.body.slice(0, 200) };
    }
    const createParsed = parseJson(createRes.body, '创建任务响应');
    if (createParsed.code !== 0) {
      return { ok: false, error: '创建任务失败：code=' + createParsed.code + ' ' + (createParsed.message || '') };
    }
    const taskId = createParsed.data && createParsed.data.task_id;
    if (!taskId) return { ok: false, error: '创建任务成功但未返回 task_id' };

    // ---------- ③ 轮询查询 ----------
    step('query');
    const deadline = Date.now() + (pollTimeoutMs || 120000);
    const queryBody = JSON.stringify({ common: { app_id: appId }, business: { task_id: taskId } });
    const queryBodyBuffer = Buffer.from(queryBody, 'utf8');
    let lastError = '';
    while (Date.now() < deadline) {
      await sleep(2000);
      const queryRes = await signedPost(
        OST_HOST, QUERY_PATH, queryBodyBuffer, 'application/json', apiKey, apiSecret, 15000,
      );
      if (queryRes.status === 0) {
        lastError = '查询网络错误（' + queryRes.error + '）';
        continue;
      }
      if (queryRes.status !== 200) {
        lastError = '查询 HTTP ' + queryRes.status + ' ' + queryRes.body.slice(0, 120);
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(queryRes.body);
      } catch (e) {
        lastError = '查询响应不是 JSON';
        continue;
      }
      if (!parsed || parsed.code !== 0) {
        lastError = parsed && parsed.code !== undefined
          ? '查询 code=' + parsed.code + ' ' + (parsed.message || '')
          : '查询响应异常';
        continue;
      }
      const status = parsed.data && parsed.data.task_status;
      // task_status: '1'=排队中 '2'=转写中；其余视为完成
      if (status !== '1' && status !== '2') {
        const text = extractXfyunText(parsed.data && parsed.data.result);
        if (text) return { ok: true, text };
        return { ok: false, error: '转写完成但未返回文本（可能是静音录音或音频格式不受支持）' };
      }
    }
    return { ok: false, error: '转写超时（' + Math.round((pollTimeoutMs || 120000) / 1000) + 's）' + (lastError ? '，最后状态：' + lastError : '') };
  } catch (e) {
    return { ok: false, error: '语音识别异常：' + (e && e.message ? e.message : String(e)) };
  }
}

module.exports = { transcribeXfyun, extractXfyunText, buildMultipart, signedPost, rfc1123Date };
