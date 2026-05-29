<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  role: 'user' | 'coach'
  text: string
  meta?: string
  streaming?: boolean
  thinking?: boolean
}>()

type CoachBlock =
  | { type: 'heading'; text: InlineSegment[] }
  | { type: 'paragraph'; text: InlineSegment[] }
  | { type: 'list'; items: InlineSegment[][] }
  | { type: 'quote'; text: InlineSegment[] }
  | { type: 'table'; headers: InlineSegment[][]; rows: InlineSegment[][][] }
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
  let index = 0

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

  while (index < lines.length) {
    const line = lines[index]
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
      index += 1
      continue
    }

    if (inCode) {
      code.push(line)
      index += 1
      continue
    }

    if (!trimmed) {
      flushParagraph()
      flushList()
      index += 1
      continue
    }

    if (trimmed === '---') {
      flushParagraph()
      flushList()
      blocks.push({ type: 'divider' })
      index += 1
      continue
    }

    const table = readMarkdownTable(lines, index)
    if (table) {
      flushParagraph()
      flushList()
      blocks.push(table.block)
      index = table.nextIndex
      continue
    }

    const quote = trimmed.match(/^>\s?(.+)$/)
    if (quote) {
      flushParagraph()
      flushList()
      const quoteLines: string[] = []
      while (index < lines.length) {
        const nextQuote = lines[index].trim().match(/^>\s?(.+)$/)
        if (!nextQuote) break
        quoteLines.push(nextQuote[1])
        index += 1
      }
      blocks.push({ type: 'quote', text: parseInlineMarkdown(quoteLines.join(' ')) })
      continue
    }

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: parseInlineMarkdown(heading[1]) })
      index += 1
      continue
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      list.push(bullet[1])
      index += 1
      continue
    }

    flushList()
    paragraph.push(trimmed)
    index += 1
  }

  flushParagraph()
  flushList()
  if (code.length) blocks.push({ type: 'code', text: code.join('\n') })
  return blocks
}

function readMarkdownTable(lines: string[], startIndex: number): { block: CoachBlock; nextIndex: number } | null {
  if (startIndex + 1 >= lines.length) return null
  const header = splitMarkdownTableRow(lines[startIndex])
  const separator = splitMarkdownTableRow(lines[startIndex + 1])
  if (header.length < 2 || separator.length !== header.length || !separator.every(isMarkdownTableSeparator)) return null

  const rows: InlineSegment[][][] = []
  let nextIndex = startIndex + 2
  while (nextIndex < lines.length) {
    const cells = splitMarkdownTableRow(lines[nextIndex])
    if (cells.length !== header.length) break
    rows.push(cells.map(parseInlineMarkdown))
    nextIndex += 1
  }

  if (!rows.length) return null
  return {
    block: {
      type: 'table',
      headers: header.map(parseInlineMarkdown),
      rows
    },
    nextIndex
  }
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return []
  return trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isMarkdownTableSeparator(value: string) {
  return /^:?-{3,}:?$/.test(value)
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
  <article class="coach-message" :class="[role === 'user' ? 'coach-message-user' : 'coach-message-ai', { 'coach-message-streaming': streaming, 'coach-message-thinking': thinking }]">
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
        <blockquote v-else-if="block.type === 'quote'">
          <template v-for="(segment, segmentIndex) in block.text" :key="segmentIndex">
            <strong v-if="segment.bold">{{ segment.text }}</strong>
            <span v-else>{{ segment.text }}</span>
          </template>
        </blockquote>
        <div v-else-if="block.type === 'table'" class="coach-report-table-wrap">
          <table>
            <thead>
              <tr>
                <th v-for="(header, headerIndex) in block.headers" :key="headerIndex">
                  <template v-for="(segment, segmentIndex) in header" :key="segmentIndex">
                    <strong v-if="segment.bold">{{ segment.text }}</strong>
                    <span v-else>{{ segment.text }}</span>
                  </template>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
                <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                  <template v-for="(segment, segmentIndex) in cell" :key="segmentIndex">
                    <strong v-if="segment.bold">{{ segment.text }}</strong>
                    <span v-else>{{ segment.text }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre v-else-if="block.type === 'code'"><code>{{ block.text }}</code></pre>
        <hr v-else />
      </template>
    </div>
  </article>
</template>
