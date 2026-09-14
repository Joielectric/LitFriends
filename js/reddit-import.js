// Turning a creator's Reddit history into draft catalogue entries.
//
// The Tools page asks /api/reddit for their posts (from GWASI) and their
// uploads (from Soundgasm and HotAudio) and hands them here. Nothing in this
// file fetches or saves. It only decides which posts and uploads are the same
// audio and what each draft says, so it can be tested on its own.
//
// GWASI keeps a post's title, flair, date, length and mentions but not its
// body, so the link and description come from the upload. A post that
// matches no upload is still offered, linking to Reddit, but left unticked.
(function (root) {
  'use strict';

  // Posts that are not an audio: script offers, requests, verification and
  // housekeeping. Read from the flair and the bracketed tags only, since a
  // title may use these words in its prose, and a "[Request Fill]" is audio.
  const NOT_AUDIO = /\boffer\b|\brequest\b(?!\s*fill)|verification|introduction|announcement|\bcollection\b/i;
  const FILL = /\b(?:script|prompt|request)\s*fill\b/i;

  // Some titles open a tag with the wrong key: "{F4M]" or "[F4M[".
  const fixBrackets = s => String(s || '')
    .replace(/\{([^{}[\]]*)\]/g, '[$1]')
    .replace(/\[([^[\]]*)\[/g, '[$1] ');
  // Two titles name the same audio when their words match, tags aside.
  const titleKey = s => titleOf(s, String(s || '').replace(/\[[^\]]*\]/g, ' '))
    .replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]/g, '');
  const urlKey = u => String(u || '').trim().toLowerCase()
    .replace(/^https?:\/\/(www\.|old\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  const bare = n => String(n || '').trim().replace(/^\/?u\//i, '').toLowerCase();
  const redditUrl = p => `https://www.reddit.com/r/${p.subreddit}/comments/${p.id}/`;

  // A Reddit title is "[F4M] The Title [tag] a little [tag]". Everything
  // outside brackets is not the title: words between tags belong to the tags,
  // so the title is the first run of real words, less a trailing "by u/name".
  // Labels some creators put where a tag would go, which are not the title.
  const NOT_TITLE = /^(?:collab(?:oration)?|repost|re-?upload|oc|new|sfw|nsfw|script fill|improv(?:isation)?)$/i;

  function titleOf(raw, fallback) {
    const run = fixBrackets(raw).split(/\[[^\]]*\]/)
      .map(s => s.replace(/\s+/g, ' ').replace(/^[\s\-–—|:,.]+|[\s\-–—|:,.]+$/g, '').trim())
      .find(s => /[a-z0-9]{2}/i.test(s) && !NOT_TITLE.test(s));
    const title = (run || '').replace(/\s*\S*\s*\b(?:by|with|w\/|ft\.?|feat\.?)\s+u\/[A-Za-z0-9_-]+.*$/i, '').trim();
    return title || fallback || '';
  }

  function isAudioPost(p) {
    const labels = (p.flair || '') + ' ' + (String(p.title || '').match(/\[[^\]]*\]/g) || []).join(' ');
    if (NOT_AUDIO.test(labels) || /verification/i.test(p.title || '')) return false;
    // GWASI gives an audio's length in tenths of a minute, a script's as
    // minus hundreds of words.
    return (p.length || 0) > 0;
  }

  // Two titles are the same audio when one holds the other, which covers a
  // repost that added words. Not when that would make "Part 1" match "Part 12".
  function looseSame(a, b) {
    if (a.length < 12 || b.length < 12) return false;
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    const at = l.indexOf(s);
    if (at < 0) return false;
    return !(/\d$/.test(s) && /\d/.test(l.charAt(at + s.length))) && !(/^\d/.test(s) && /\d/.test(l.charAt(at - 1)));
  }

  /**
   * o = {
   *   posts, uploads,          // GWASI posts, and { provider, url, title, desc } uploads
   *   handle, name,            // the Reddit name, and the name to credit
   *   catalogue,               // current entries, to skip what is already here
   *   parseBracketed,          // title -> { title, tags }
   *   normalizeTags,           // tags -> tags, cleaned and deduped
   * }
   * Returns { drafts: [{ entry, checked, note }], stats }.
   */
  function buildDrafts(o) {
    const handle = bare(o.handle);

    const known = new Set();
    const audioTitles = new Set();
    const scriptTitles = new Map();
    const creditNames = new Map();
    (o.catalogue || []).forEach(e => {
      (e.links || []).forEach(l => { if (l && l.url) known.add(urlKey(l.url)); });
      if (e.sourceLink) known.add(urlKey(e.sourceLink));
      if (e.sourceId) known.add('id:' + String(e.sourceId).toLowerCase());
      const k = titleKey(e.title);
      if (k && (e.type || 'audio') === 'audio') audioTitles.add(k);
      if (k && e.type === 'script' && !scriptTitles.has(k)) scriptTitles.set(k, e);
      Object.values(e.credits || {}).forEach(list => (Array.isArray(list) ? list : []).forEach(n => {
        if (n && !creditNames.has(bare(n))) creditNames.set(bare(n), n);
      }));
    });
    // Credit someone the way the catalogue already does, so their work finds them.
    const credit = n => creditNames.get(bare(n)) || 'u/' + String(n).replace(/^\/?u\//i, '');

    const groups = [];
    const byTitle = new Map();
    const remember = (g, title) => { const k = titleKey(title); if (k && !byTitle.has(k)) byTitle.set(k, g); };
    const looseFind = title => {
      const k = titleKey(title);
      for (const [other, g] of byTitle) if (looseSame(k, other)) return g;
      return null;
    };

    // What is up on the hosts is the starting point: those links play.
    const seenUrls = new Set();
    (o.uploads || []).forEach(u => {
      if (!u || !u.url || /verification/i.test(u.title) || seenUrls.has(urlKey(u.url))) return;
      seenUrls.add(urlKey(u.url));
      // The same audio uploaded twice is still one audio, with both links.
      const same = byTitle.get(titleKey(u.title));
      if (same) { same.links.push({ provider: u.provider, url: u.url }); return; }
      const g = { links: [{ provider: u.provider, url: u.url }], posts: [], upload: u };
      groups.push(g);
      remember(g, u.title);
    });

    let matched = 0;
    const audio = (o.posts || []).filter(isAudioPost).sort((a, b) => a.created - b.created);
    audio.forEach(p => {
      let g = byTitle.get(titleKey(p.title)) || looseFind(p.title);
      if (g && g.upload) matched++;
      if (!g) { g = { links: [], posts: [], upload: null }; groups.push(g); }
      g.posts.push(p);
      remember(g, p.title);
    });

    const stats = { posts: (o.posts || []).length, audioPosts: audio.length, uploads: seenUrls.size, matched, already: 0 };
    const drafts = [];
    groups.forEach(g => {
      if (g.links.some(l => known.has(urlKey(l.url))) ||
          g.posts.some(p => known.has(urlKey(redditUrl(p))) || known.has('id:reddit/' + String(p.id).toLowerCase()))) {
        stats.already++;
        return;
      }

      const first = g.posts[0];
      const main = g.posts.find(p => /^gonewildaudio$/i.test(p.subreddit)) || first;
      const titles = g.posts.map(p => p.title).concat(g.upload ? [g.upload.title] : []);
      const parsed = o.parseBracketed(fixBrackets(titles[0]));
      parsed.title = titleOf(titles[0], parsed.title);
      // Tags from the Reddit posts. The upload's copy of the title is usually
      // an older wording of the same tags, so it is only used when no post is.
      const tagTitles = g.posts.length ? g.posts.map(p => p.title) : titles;
      const tags = o.normalizeTags([].concat(...tagTitles.map(t => o.parseBracketed(fixBrackets(t)).tags)))
        .filter(t => !/^\d{1,2}(:\d{2}){1,2}$/.test(t));

      const desc = (g.upload && g.upload.desc) || '';
      const text = titles.join(' ') + '\n' + g.posts.map(p => p.extra || '').join(' ') + '\n' + desc;

      const summary = desc.match(/(?:^|\n)\s*(?:listener\s+)?summary\s*:\s*([^\n]{10,300})/i);
      // The first line that describes the audio, not one sending people elsewhere.
      const line = desc.split('\n').map(s => s.trim())
        .find(s => s.length >= 20 && !/https?:|www\.|\.com\b|u\/|patreon|onlyfans|visit|link|subscribe|follow me/i.test(s));
      const shortDesc = summary ? summary[1].trim() : (line && line.length <= 240 ? line : '');

      const time = text.match(/(?:TRT|length|runtime|duration)\s*:?\s*\(?\s*(\d{1,2}:\d{2}(?::\d{2})?)/i) ||
                   titles.join(' ').match(/\[\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\]/);
      const tenths = Math.max(0, ...g.posts.map(p => p.length || 0));
      const trt = time ? time[1].replace(/^00?:(?=\d{2}:\d{2}$)/, '') : tenths > 0 ? Math.round(tenths / 10) + ' min' : '';

      const collabs = [...new Set([...text.matchAll(/collab(?:oration|orated)?\s*(?:with|w\/)\s*u\/([A-Za-z0-9_-]{3,20})/gi)]
        .map(m => m[1]).filter(u => bare(u) !== handle))];
      const fill = g.posts.some(p => FILL.test((p.flair || '') + ' ' + p.title)) || FILL.test(titles.join(' '));
      const script = fill ? scriptTitles.get(titleKey(parsed.title)) : null;
      let writer = '';
      if (fill) {
        const named = text.match(/(?:script|written|words|writer|story)\s*(?:by|from|:)\s*:?\s*u\/([A-Za-z0-9_-]{3,20})/i);
        if (named && bare(named[1]) !== handle) writer = named[1];
        else if (script && script.credits && (script.credits.writers || [])[0]) writer = script.credits.writers[0];
        else {
          // One other person mentioned on a fill is, in practice, its writer.
          const others = new Map();
          [...text.matchAll(/\bu\/([A-Za-z0-9_-]{3,20})/g)].map(m => m[1])
            .filter(u => bare(u) !== handle && !collabs.some(c => bare(c) === bare(u)))
            .forEach(u => { if (!others.has(bare(u))) others.set(bare(u), u); });
          if (others.size === 1) writer = [...others.values()][0];
        }
      }

      const links = g.links.slice();
      if (main) links.push({ provider: 'reddit', url: redditUrl(main) });

      const similar = audioTitles.has(titleKey(parsed.title));
      const voices = [o.name].concat(collabs.map(credit)).filter(Boolean);

      drafts.push({
        checked: g.links.length > 0 && !similar,
        note: [
          similar ? 'a similar title is already in the catalogue' : '',
          g.links.length ? '' : 'Reddit link only',
        ].filter(Boolean).join(', '),
        entry: {
          title: parsed.title || (g.upload && g.upload.title) || 'Untitled',
          type: 'audio',
          date: first ? new Date(first.created * 1000).toISOString().slice(0, 10) : '',
          tags,
          shortDesc,
          desc,
          links,
          trt,
          fills: script ? script.id : '',
          credits: {
            voiceArtists: [...new Set(voices)],
            writers: writer ? [credit(writer)] : [],
            producers: [], editors: [], musicians: [],
          },
          source: 'reddit',
          sourceId: main ? 'reddit/' + main.id : g.links[0].provider + '/' + urlKey(g.links[0].url),
          sourceLink: main ? redditUrl(main) : g.links[0].url,
        },
      });
    });

    drafts.sort((a, b) => (b.entry.date || '').localeCompare(a.entry.date || ''));
    return { drafts, stats };
  }

  const api = { isAudioPost, buildDrafts, titleKey };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RedditImport = api;
})(typeof window !== 'undefined' ? window : this);
