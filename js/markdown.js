/* A small Markdown renderer for update posts — the landing page's Latest &
 * News and each creator's own updates.
 *
 *   Markdown.render(text)   safe HTML for that text
 *
 * Update text is typed by people, so nothing in it is ever treated as markup:
 * everything is escaped first, and only the Markdown below turns into tags.
 *
 *   # Heading, ## Smaller, ### Smaller still
 *   **bold**  __bold__  *italic*  _italic_  ~~struck~~  `code`
 *   [link text](https://example.com)   bare https://… links still work
 *   - bullet / * bullet / + bullet      1. numbered
 *   > quote                             --- (a dividing line)
 *
 * A blank line starts a new paragraph; single line breaks are kept, as they
 * always were. Links only go to http(s), mailto: or a path on this site.
 *
 *   Markdown.render(text, { html: true })
 *
 * also lets a short list of plain HTML tags through, for writing that people
 * paste in from elsewhere (a profile's About text): <b> <i> <u> <a href> <p>
 * <br> <ul>/<ol>/<li> <blockquote> <h1>–<h6> and similar, plus entities like
 * &mdash;. Markdown and HTML can be mixed. The result is rebuilt through the
 * browser's own parser keeping only those tags and safe link addresses, so no
 * script, style, event handler or stray unclosed tag gets onto the page.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  // http(s), mailto and site-relative only; javascript:, data: and the rest
  // are dropped, and the link text is shown on its own.
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
    return u;
  }

  function link(href, inner) {
    var external = !/^(\/|#|\.)/.test(href) || /^\/\//.test(href);
    return '<a href="' + esc(href) + '"' +
      (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + inner + '</a>';
  }

  // Tags allowed through in html mode, with what each becomes. The page's own
  // headings are h1 and h2, so a pasted h1/h2 drops to h3.
  var TAGS = {
    a: 'a', b: 'strong', strong: 'strong', i: 'em', em: 'em', u: 'u', s: 'del', strike: 'del', del: 'del',
    mark: 'mark', small: 'small', sup: 'sup', sub: 'sub', br: 'br', hr: 'hr', code: 'code', span: 'span',
    p: 'p', div: 'p', ul: 'ul', ol: 'ol', li: 'li', blockquote: 'blockquote',
    h1: 'h3', h2: 'h3', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h5'
  };
  // Removed along with everything inside them; any other unknown tag is
  // unwrapped and its text kept.
  var DROP = /^(script|style|iframe|frame|frameset|object|embed|template|svg|math|noscript|textarea|select|button|input|form|link|meta|base|head|title|img|video|audio|source|canvas)$/;
  var BLOCK_LINE = /^\s*<\/?(p|div|ul|ol|li|blockquote|h[1-6]|hr|br)\b[^<>]*>/i;

  // Keeps only the tags above, with safe hrefs, and nothing else.
  function sanitize(html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    function clean(node, into) {
      Array.prototype.forEach.call(node.childNodes, function (n) {
        if (n.nodeType === 3) { into.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        var name = n.nodeName.toLowerCase();
        if (DROP.test(name)) return;
        var to = TAGS[name];
        if (!to) { clean(n, into); return; }
        var el = document.createElement(to);
        if (to === 'a') {
          var href = safeUrl(n.getAttribute('href'));
          if (!href) { clean(n, into); return; }
          el.setAttribute('href', href);
          if (!/^(\/|#|\.)/.test(href) || /^\/\//.test(href)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
        }
        clean(n, el);
        // Unbalanced tags leave empty paragraphs behind; they would only add gaps.
        if (to === 'p' && !el.textContent.trim() && !el.querySelector('br,hr')) return;
        into.appendChild(el);
      });
    }
    var out = document.createElement('div');
    clean(tpl.content, out);
    return out.innerHTML;
  }

  // Code, links and bare URLs are set aside as placeholders first, so the
  // emphasis rules never reach inside them (an _ in a URL stays an _).
  function inline(s, noLinks, html) {
    var held = [];
    function hold(h) { held.push(h); return '\u0000' + (held.length - 1) + '\u0000'; }

    s = String(s).replace(/\u0000/g, '');
    s = s.replace(/`([^`\n]+)`/g, function (_, code) { return hold('<code>' + esc(code) + '</code>'); });
    if (html) {
      // Kept as typed; sanitize() decides what survives. Held before links so a
      // URL inside href="…" is not turned into a second link.
      s = s.replace(/<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/gi, function (tag) { return hold(tag); })
           .replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/gi, function (ent) { return hold(ent); });
    }
    if (!noLinks) {
      s = s.replace(/\[([^\]\n]+)\]\(\s*([^()\s]+(?:\([^()\s]*\)[^()\s]*)*)\s*\)/g, function (all, text, url) {
        var href = safeUrl(url);
        return hold(href ? link(href, inline(text, true, html)) : inline(text, true, html));
      });
      s = s.replace(/https?:\/\/[^\s<>"\u0000]+/g, function (u) {
        var trail = '', m = u.match(/[.,;:!?)\]]+$/);
        if (m) { trail = m[0]; u = u.slice(0, -trail.length); }
        return hold(link(u, esc(u))) + trail;
      });
    }

    s = esc(s)
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
      .replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>')
      .replace(/(^|[^\w])_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
      .replace(/\r?\n/g, '<br>');

    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return held[+i]; });
  }

  function render(text, opts) {
    var html = !!(opts && opts.html);
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var out = [], para = [], list = null, quote = [];

    function flushPara() { if (para.length) { out.push('<p>' + inline(para.join('\n'), false, html) + '</p>'); para = []; } }
    function flushList() {
      if (list) { out.push('<' + list.tag + '>' + list.items.map(function (i) { return '<li>' + inline(i, false, html) + '</li>'; }).join('') + '</' + list.tag + '>'); list = null; }
    }
    function flushQuote() { if (quote.length) { out.push('<blockquote>' + inline(quote.join('\n'), false, html) + '</blockquote>'); quote = []; } }
    function flush() { flushPara(); flushList(); flushQuote(); }

    lines.forEach(function (line) {
      var m;
      if (!line.trim()) { flush(); return; }
      // A line that opens or closes an HTML block (<p>, <ul>, <li>…) is its own
      // block, not wrapped in a paragraph of ours.
      if (html && BLOCK_LINE.test(line)) { flush(); out.push(inline(line.trim(), false, html)); return; }
      if ((m = /^\s{0,3}(#{1,3})\s+(.*?)\s*#*\s*$/.exec(line))) {
        flush(); out.push('<h' + (m[1].length + 2) + '>' + inline(m[2], false, html) + '</h' + (m[1].length + 2) + '>'); return;
      }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); return; }
      if ((m = /^\s{0,3}>\s?(.*)$/.exec(line))) { flushPara(); flushList(); quote.push(m[1]); return; }
      var ul = /^\s{0,3}[-*+]\s+(.*)$/.exec(line), ol = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/.exec(line);
      if (ul || ol) {
        var tag = ul ? 'ul' : 'ol';
        flushPara(); flushQuote();
        if (list && list.tag !== tag) flushList();
        if (!list) list = { tag: tag, items: [] };
        list.items.push((ul || ol)[1]);
        return;
      }
      // A plain line straight after a list item carries that item on.
      if (list && /^\s+\S/.test(line)) { list.items[list.items.length - 1] += '\n' + line.trim(); return; }
      flushList(); flushQuote();
      para.push(line);
    });
    flush();
    return html ? sanitize(out.join('')) : out.join('');
  }

  // Plain text of what render() would show, for a one-line excerpt.
  function plain(text) {
    var d = document.createElement('div');
    d.innerHTML = render(text, { html: true }).replace(/<\/(p|li|h\d|blockquote)>|<br>/g, '$& ');
    return d.textContent.replace(/\s+/g, ' ').trim();
  }

  window.Markdown = { render: render, plain: plain };
})();
