<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  role: 'user' | 'coach'
  text: string
  meta?: string
  streaming?: boolean
}>()

type CoachBlock =
  | { type: 'heading'; text: InlineSegment[] }
  | { type: 'paragraph'; text: InlineSegment[] }
  | { type: 'list'; items: InlineSegment[][] }
  | { type: 'code'; text: string }
  | { type: 'divider' }

type InlineSegment = {
  text: string
  bold: boolean
}

const blocks = computed(() => parseCoachMarkdown(props.text))

function parseCoachMarkdown(markdown: string): CoachBlock[] {
  const blocks: CoachBlock[] = []
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let paragraph: string[] = []
  let list: string[] = []
  let code: string[] = []
  let inCode = false

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: parseInlineMarkdown(paragraph.join(' ')) })
      paragraph = []
    }
  }

  function flushList() {
    if (list.length) {
      blocks.push({ type: 'list', items: list.map(parseInlineMarkdown) })
      list = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      if (inCode) {
        blocks.push({ type: 'code', text: code.join('\n') })
        code = []
        inCode = false
      } else {
        flushParagraph()
        flushList()
        inCode = true
      }
      continue
    }

    if (inCode) {
      code.push(line)
      continue
    }

    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }

    if (trimmed === '---') {
      flushParagraph()
      flushList()
      blocks.push({ type: 'divider' })
      continue
    }

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: parseInlineMarkdown(heading[1]) })
      continue
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      list.push(bullet[1])
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()
  if (code.length) blocks.push({ type: 'code', text: code.join('\n') })
  return blocks
}

function parseInlineMarkdown(text: string): InlineSegment[] {
  const segments: InlineSegment[] = []
  const pattern = /\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false })
    }
    segments.push({ text: match[1], bold: true })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false })
  }

  return segments.length ? segments : [{ text, bold: false }]
}
</script>

<template>
  <article class="coach-message" :class="[role === 'user' ? 'coach-message-user' : 'coach-message-ai', { 'coach-message-streaming': streaming }]">
    <small v-if="meta">{{ meta }}</small>
    <div class="coach-report">
      <template v-for="(block, index) in blocks" :key="index">
        <h3 v-if="block.type === 'heading'">
          <template v-for="(segment, segmentIndex) in block.text" :key="segmentIndex">
            <strong v-if="segment.bold">{{ segment.text }}</strong>
            <span v-else>{{ segment.text }}</span>
          </template>
        </h3>
        <p v-else-if="block.type === 'paragraph'">
          <template v-for="(segment, segmentIndex) in block.text" :key="segmentIndex">
            <strong v-if="segment.bold">{{ segment.text }}</strong>
            <span v-else>{{ segment.text }}</span>
          </template>
        </p>
        <ul v-else-if="block.type === 'list'">
          <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
            <template v-for="(segment, segmentIndex) in item" :key="segmentIndex">
              <strong v-if="segment.bold">{{ segment.text }}</strong>
              <span v-else>{{ segment.text }}</span>
            </template>
          </li>
        </ul>
        <pre v-else-if="block.type === 'code'"><code>{{ block.text }}</code></pre>
        <hr v-else />
      </template>
    </div>
  </article>
</template>
