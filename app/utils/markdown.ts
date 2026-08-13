import MarkdownIt from 'markdown-it'
import DOMPurify from 'isomorphic-dompurify'

const md = new MarkdownIt({ html: true, linkify: true, breaks: false })

export function renderMarkdown(src: string): string {
  const raw = md.render(src ?? '')
  // isomorphic-dompurify sanitizes identically on server and client.
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'rel'],
  })
}
