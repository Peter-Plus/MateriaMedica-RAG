/* Shared by new answers and conversation history. No raw HTML or remote images. */
const answerMarkdown = window.markdownit({ html: false, breaks: true, linkify: false });
const validateMarkdownLink = answerMarkdown.validateLink.bind(answerMarkdown);
answerMarkdown.validateLink = href => /^https?:\/\//i.test(href) && validateMarkdownLink(href);

// Keep image descriptions without fetching model-supplied remote resources.
answerMarkdown.renderer.rules.image = (tokens, index) =>
  answerMarkdown.utils.escapeHtml(tokens[index].content);
answerMarkdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};

function renderAnswerMarkdown(text) {
  return window.DOMPurify.sanitize(answerMarkdown.render(String(text || '')), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'table', 'thead', 'tbody',
      'tr', 'th', 'td', 'a'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'start'],
    ALLOW_DATA_ATTR: false
  });
}
