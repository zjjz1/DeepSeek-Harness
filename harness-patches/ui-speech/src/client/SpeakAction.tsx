/**
 * Read-aloud action for one finalized assistant message: speaks the message's
 * plain text through the platform speech synthesis (system voices), with a
 * stop toggle. Inert when the platform has no speech synthesis or the message
 * has no text.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { MessageId } from '@deepseek-ai/dsh-client-connection/client'
import css from './SpeakAction.module.css'

/** Full component props: the assistant-actions seat + locale seat. */
export type SpeakActionProps = PropsRuntime<'conversation.chat.assistant-actions'> & PropsLocale<'ui-speech'>

/** Plain-text projection of one assistant message node. */
function nodeText(node: ConversationNode): string {
  if (node.kind !== 'assistant') return ''
  return node.blocks
    .filter(block => block.kind === 'text' || block.kind === 'reasoning')
    .map(block => block.text)
    .join(' ')
    .trim()
}

/** Whether the platform exposes speech synthesis. */
function speechAvailable(): boolean {
  return typeof globalThis !== 'undefined' && 'speechSynthesis' in globalThis
}

/**
 * Render the speak/stop action.
 * @param props - message identity + session kit + locale.
 * @returns the action button.
 */
export function SpeakAction({ messageId, useSession, t }: SpeakActionProps) {
  const nodes = useSession(s => s.chat.legacy.nodes) as readonly ConversationNode[]
  const [speaking, setSpeaking] = useState(false)

  const text = useMemo(() => {
    for (const node of nodes) {
      if (node.kind === 'assistant' && node.messageId === (messageId as MessageId)) {
        return nodeText(node)
      }
    }
    return ''
  }, [nodes, messageId])

  const available = speechAvailable()
  const enabled = available && text !== ''

  // Stop any utterance when the message or session goes away.
  useEffect(() => {
    return () => {
      if (speaking && available) speechSynthesis.cancel()
    }
  }, [speaking, available])

  const toggle = useCallback(() => {
    if (!available) return
    if (speaking) {
      speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    if (text === '') return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.onend = () => { setSpeaking(false) }
    utterance.onerror = () => { setSpeaking(false) }
    speechSynthesis.speak(utterance)
    setSpeaking(true)
  }, [speaking, text, available])

  return (
    <button
      type="button"
      className={css.speak}
      disabled={!enabled}
      aria-pressed={speaking}
      title={speaking ? t('action.stop') : t('action.speak')}
      onClick={toggle}
    >
      {speaking ? t('action.stop') : t('action.speak')}
    </button>
  )
}
