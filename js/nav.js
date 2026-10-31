(function () {
  // Determine path prefix based on current location
  const isInSubdir = /\/profiles\//.test(location.pathname);
  const root = isInSubdir ? '../' : '';
  const isTools = /\/tools\.html/.test(location.pathname);

  const LINKS = [
    { label: 'Home',    href: root + 'the-velvet-key.html' },
    { label: 'About',   href: root + 'velvet-key-about.html' },
    { label: 'Listen',  href: root + 'velvet-key-catalog.html' },
    { label: 'Artists', href: null, children: [
      { label: 'JOI Electric',        href: root + 'profiles/joi-electric.html' },
    ]},
    { label: 'Log in',  href: root + 'tools.html', admin: true },
  ];

  const CSS = `
  #ca-nav {
    position: fixed; top: 0; left: 50%; transform: translateX(-50%);
    width: calc(100% - 3rem); max-width: 960px;
    z-index: 9000;
    background: rgba(21,16,20,0.92);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(200,120,110,0.32);
    border-top: none;
    border-radius: 0 0 6px 6px;
    font-family: "Cinzel", serif;
  }
  #ca-nav-inner {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 1.5rem; height: 52px;
  }
  @keyframes ca-logo-breathe {
    0%, 100% { filter: drop-shadow(0 0 8px rgba(176,40,74,0.6)) drop-shadow(0 0 22px rgba(110,20,48,0.35)); }
    50%       { filter: drop-shadow(0 0 22px rgba(176,40,74,1.0)) drop-shadow(0 0 50px rgba(110,20,48,0.7)); }
  }
  #ca-nav-logo {
    display: flex; align-items: center; gap: 0.6rem;
    text-decoration: none; white-space: nowrap;
    animation: ca-logo-breathe 3.5s ease-in-out infinite;
  }
  #ca-nav-logo img { width: 38px; height: 38px; flex-shrink: 0; display: block; }
  #ca-nav-logo span {
    font-size: 0.9rem; letter-spacing: .3em; text-transform: uppercase; color: #ffffff;
    background: linear-gradient(135deg, #ffffff, #f2c4d0 40%, #c04a6c);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  }
  #ca-nav-links {
    display: flex; align-items: center; gap: 0; list-style: none; margin: 0; padding: 0;
  }
  .ca-nav-item { position: relative; }
  .ca-nav-link, .ca-nav-btn {
    display: block; padding: 0 1rem; line-height: 52px;
    font-size: 0.62rem; letter-spacing: .22em; text-transform: uppercase;
    color: #c8b8b0; text-decoration: none;
    background: none; border: none; cursor: pointer; font-family: inherit;
    transition: color .2s; white-space: nowrap;
  }
  .ca-nav-link:hover, .ca-nav-btn:hover, .ca-nav-link.active { color: #f5ece8; }
  .ca-nav-link.admin-link { color: #d0607a; }
  .ca-nav-link.admin-link:hover { color: #f5ece8; }

  /* Dropdown */
  .ca-nav-dropdown {
    position: absolute; top: 52px; left: 0;
    background: rgba(28,22,27,0.98);
    border: 1px solid rgba(200,120,110,0.2);
    border-top: 2px solid #d0607a;
    min-width: 200px; list-style: none; padding: 0.4rem 0;
    opacity: 0; pointer-events: none;
    transform: translateY(-6px);
    transition: opacity .18s, transform .18s;
    backdrop-filter: blur(12px);
  }
  .ca-nav-item:hover .ca-nav-dropdown,
  .ca-nav-item.open .ca-nav-dropdown {
    opacity: 1; pointer-events: auto; transform: translateY(0);
  }
  .ca-nav-dropdown a {
    display: block; padding: 0.55rem 1.2rem;
    font-size: 0.6rem; letter-spacing: .18em; text-transform: uppercase;
    color: #c8b8b0; text-decoration: none; transition: color .15s, background .15s;
  }
  .ca-nav-dropdown a:hover { color: #f5ece8; background: rgba(176,40,74,0.08); }

  /* Hamburger */
  #ca-hamburger {
    display: none; flex-direction: column; gap: 5px;
    background: none; border: none; cursor: pointer; padding: 6px;
  }
  #ca-hamburger span {
    display: block; width: 22px; height: 1.5px; background: #d8c8c0;
    transition: transform .25s, opacity .25s;
  }
  #ca-hamburger.open span:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
  #ca-hamburger.open span:nth-child(2) { opacity: 0; }
  #ca-hamburger.open span:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }

  /* Mobile drawer */
  #ca-mobile-menu {
    display: none; flex-direction: column;
    background: rgba(21,16,20,0.98); border-top: 1px solid rgba(200,120,110,0.25);
    padding: 0.6rem 0 1rem; max-height: 80vh; overflow-y: auto;
  }
  #ca-mobile-menu.open { display: flex; }
  .ca-mobile-link, .ca-mobile-btn {
    display: block; padding: 0.75rem 1.8rem;
    font-family: "Cinzel", serif; font-size: 0.65rem; letter-spacing: .2em; text-transform: uppercase;
    color: #c8b8b0; text-decoration: none;
    background: none; border: none; cursor: pointer; text-align: left; width: 100%;
    transition: color .15s;
  }
  .ca-mobile-link:hover, .ca-mobile-btn:hover { color: #f5ece8; }
  .ca-mobile-link.admin-link { color: #d0607a; }
  .ca-mobile-link.admin-link:hover { color: #f5ece8; }
  .ca-mobile-sep {
    font-size: 0.55rem; letter-spacing: .3em; text-transform: uppercase;
    color: #8a6058; padding: 0.8rem 1.8rem 0.3rem;
  }
  .ca-mobile-sub { padding-left: 2.6rem; }

  /* Push page content below nav */
  body { padding-top: 72px !important; overflow-x: hidden !important; }
  html { overflow-x: hidden; }
  @media (max-width: 700px) {
    #ca-nav-links { display: none; }
    #ca-hamburger { display: flex; }
    #ca-nav-logo img { width: 32px; height: 32px; }
    #ca-nav-logo span { font-size: 0.78rem; letter-spacing: .2em; }
  }
  `;

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Build nav HTML
  const nav = document.createElement('nav');
  nav.id = 'ca-nav';

  // Inner container
  const inner = document.createElement('div');
  inner.id = 'ca-nav-inner';

  // Logo
  const logo = document.createElement('a');
  logo.id = 'ca-nav-logo';
  logo.href = root + 'the-velvet-key.html';
  logo.setAttribute('aria-label', 'The Velvet Key home');
  logo.innerHTML = '<img src="' + root + 'images/velvet-key-mark.png" alt=""><span>The Velvet Key</span>';
  inner.appendChild(logo);

  // Desktop links
  const ul = document.createElement('ul');
  ul.id = 'ca-nav-links';

  LINKS.forEach(link => {
    const li = document.createElement('li');
    li.className = 'ca-nav-item';

    if (link.children) {
      const btn = document.createElement('button');
      btn.className = 'ca-nav-btn';
      btn.textContent = link.label + ' ▾';
      btn.addEventListener('click', () => li.classList.toggle('open'));
      document.addEventListener('click', e => { if (!li.contains(e.target)) li.classList.remove('open'); });
      li.appendChild(btn);

      const sub = document.createElement('ul');
      sub.className = 'ca-nav-dropdown';
      if (link.label === 'Artists') sub.id = 'ca-artists-menu';
      link.children.forEach(child => {
        const sli = document.createElement('li');
        const a = document.createElement('a');
        a.href = child.href;
        a.textContent = child.label;
        sli.appendChild(a);
        sub.appendChild(sli);
      });
      li.appendChild(sub);
    } else if (link.admin) {
      const a = document.createElement('a');
      a.className = 'ca-nav-link admin-link';
      a.href = '#';
      a.textContent = link.label;
      if (isTools) a.classList.add('active');
      a.addEventListener('click', e => { e.preventDefault(); openAdminModal(link.href); });
      li.appendChild(a);
    } else {
      const a = document.createElement('a');
      a.className = 'ca-nav-link';
      a.href = link.href;
      a.textContent = link.label;
      if (location.pathname.endsWith(link.href.replace(/^\.\.\//, '').replace(/^\//, ''))) a.classList.add('active');
      li.appendChild(a);
    }

    ul.appendChild(li);
  });
  inner.appendChild(ul);

  // Hamburger button
  const ham = document.createElement('button');
  ham.id = 'ca-hamburger';
  ham.setAttribute('aria-label', 'Menu');
  ham.innerHTML = '<span></span><span></span><span></span>';
  inner.appendChild(ham);

  nav.appendChild(inner);

  // Mobile drawer
  const drawer = document.createElement('div');
  drawer.id = 'ca-mobile-menu';

  LINKS.forEach(link => {
    if (link.children) {
      const sep = document.createElement('div');
      sep.className = 'ca-mobile-sep';
      sep.textContent = link.label;
      drawer.appendChild(sep);
      link.children.forEach(child => {
        const a = document.createElement('a');
        a.className = 'ca-mobile-link ca-mobile-sub';
        a.href = child.href;
        a.textContent = child.label;
        drawer.appendChild(a);
      });
    } else if (link.admin) {
      const a = document.createElement('a');
      a.className = 'ca-mobile-link admin-link';
      a.href = '#';
      a.textContent = link.label;
      a.addEventListener('click', e => { e.preventDefault(); closeDrawer(); openAdminModal(link.href); });
      drawer.appendChild(a);
    } else {
      const a = document.createElement('a');
      a.className = 'ca-mobile-link';
      a.href = link.href;
      a.textContent = link.label;
      drawer.appendChild(a);
    }
  });
  nav.appendChild(drawer);

  // Artists who joined after this list was written have a published profile
  // rather than a page here. js/artists.js knows them; add them to both menus.
  if (window.Artists) {
    Artists.load().then(list => {
      const fresh = list.filter(a => a.isNew);
      if (!fresh.length) return;
      const menu = document.getElementById('ca-artists-menu');
      const subs = drawer.querySelectorAll('.ca-mobile-sub');
      let after = subs[subs.length - 1];
      fresh.forEach(artist => {
        if (menu) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = artist.href; a.textContent = artist.name;
          li.appendChild(a); menu.appendChild(li);
        }
        if (after) {
          const m = document.createElement('a');
          m.className = 'ca-mobile-link ca-mobile-sub';
          m.href = artist.href; m.textContent = artist.name;
          after.insertAdjacentElement('afterend', m); after = m;
        }
      });
    });
  }

  // Creators sign in with Google on the Content Manager. The door to it is
  // js/creator-login.js, which first says the space is invite only.
  function openAdminModal(href) {
    if (isTools || !window.CreatorLogin) { location.href = href; return; }
    CreatorLogin.open();
  }

  // Insert nav before everything else in body
  document.body.insertBefore(nav, document.body.firstChild);

  // Wire hamburger
  function closeDrawer() { drawer.classList.remove('open'); ham.classList.remove('open'); }
  ham.addEventListener('click', () => {
    const open = drawer.classList.toggle('open');
    ham.classList.toggle('open', open);
  });

})();
