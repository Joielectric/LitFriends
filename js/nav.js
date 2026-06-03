(function () {
  // Determine path prefix based on current location
  const isInSubdir = /\/profiles\//.test(location.pathname);
  const root = isInSubdir ? '../' : '';
  const isTools = /\/tools\.html/.test(location.pathname);

  const LINKS = [
    { label: 'Home',    href: root + 'index.html' },
    { label: 'Listen',  href: root + 'catalog.html' },
    { label: 'Artists', href: null, children: [
      { label: 'JOI Electric',        href: root + 'profiles/joi-electric.html' },
      { label: 'Loona Licks',         href: root + 'profiles/loona-licks.html' },
      { label: 'Miss Kitten SK',      href: root + 'profiles/misskittenSK.html' },
      { label: 'His Bad Girl 77',     href: root + 'profiles/hisbadgirl77.html' },
      { label: 'Well Nobody\'s Perfect', href: root + 'profiles/wellnobodysperfect.html' },
    ]},
    { label: 'Tools',   href: root + 'tools.html', admin: true },
  ];

  const CSS = `
  #ca-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 9000;
    background: rgba(21,16,20,0.9);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(200,120,110,0.3);
    font-family: "Cinzel", serif;
  }
  #ca-nav-inner {
    max-width: 1100px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 1.5rem; height: 52px;
  }
  #ca-nav-logo {
    font-size: 0.72rem; letter-spacing: .38em; text-transform: uppercase;
    color: #d8c8c0; text-decoration: none; white-space: nowrap;
    background: linear-gradient(135deg, #f0c8b8, #e8634f 50%, #c05070);
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
  .ca-nav-link.admin-link { color: #e8634f; }
  .ca-nav-link.admin-link:hover { color: #f5ece8; }

  /* Dropdown */
  .ca-nav-dropdown {
    position: absolute; top: 52px; left: 0;
    background: rgba(28,22,27,0.98);
    border: 1px solid rgba(200,120,110,0.2);
    border-top: 2px solid #e8634f;
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
  .ca-nav-dropdown a:hover { color: #f5ece8; background: rgba(232,99,79,0.08); }

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
  .ca-mobile-link.admin-link { color: #e8634f; }
  .ca-mobile-link.admin-link:hover { color: #f5ece8; }
  .ca-mobile-sep {
    font-size: 0.55rem; letter-spacing: .3em; text-transform: uppercase;
    color: #8a6058; padding: 0.8rem 1.8rem 0.3rem;
  }
  .ca-mobile-sub { padding-left: 2.6rem; }

  /* Admin modal */
  #ca-admin-modal {
    display: none; position: fixed; inset: 0; z-index: 10000;
    background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);
    align-items: center; justify-content: center;
  }
  #ca-admin-modal.open { display: flex; }
  #ca-admin-box {
    background: #0c090c; border: 1px solid rgba(200,120,110,0.3);
    border-top: 2px solid #e8634f;
    padding: 2rem 2.4rem; width: 100%; max-width: 380px; border-radius: 2px;
    font-family: "Cinzel", serif;
  }
  #ca-admin-box h3 {
    font-size: 0.78rem; letter-spacing: .32em; text-transform: uppercase;
    color: #d8c8c0; margin-bottom: 1.4rem;
  }
  #ca-admin-pw {
    width: 100%; padding: 10px 12px;
    background: #120f12; border: 1px solid rgba(200,120,110,0.2);
    border-radius: 2px; color: #f0e4d8;
    font-family: "Cormorant Garamond", Georgia, serif; font-size: 1.05rem;
    margin-bottom: 0.8rem;
  }
  #ca-admin-pw:focus { outline: none; border-color: #e8634f; }
  #ca-admin-msg { font-size: 0.68rem; color: #e8634f; letter-spacing: .08em; min-height: 1.2em; margin-bottom: 0.8rem; }
  #ca-admin-btns { display: flex; gap: 0.6rem; }
  .ca-admin-submit, .ca-admin-cancel {
    flex: 1; padding: 9px; background: transparent;
    border: 1px solid rgba(200,120,110,0.3); color: #d8c8c0;
    font-family: "Cinzel", serif; font-size: 0.65rem; letter-spacing: .14em; text-transform: uppercase;
    cursor: pointer; border-radius: 2px; transition: border-color .2s, color .2s;
  }
  .ca-admin-submit { border-color: #e8634f; color: #e8634f; }
  .ca-admin-submit:hover { background: #e8634f; color: #fff; }
  .ca-admin-cancel:hover { border-color: #d8c8c0; color: #f5ece8; }

  /* Push page content below nav */
  body { padding-top: 52px !important; overflow-x: hidden !important; }
  html { overflow-x: hidden; }
  @media (max-width: 700px) {
    #ca-nav-links { display: none; }
    #ca-hamburger { display: flex; }
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
  logo.href = root + 'index.html';
  logo.textContent = 'Consenting Adults';
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

  // Admin modal
  const modal = document.createElement('div');
  modal.id = 'ca-admin-modal';
  modal.innerHTML = `
    <div id="ca-admin-box">
      <h3>Admin Access</h3>
      <input id="ca-admin-pw" type="password" placeholder="Password" autocomplete="current-password">
      <div id="ca-admin-msg"></div>
      <div id="ca-admin-btns">
        <button class="ca-admin-submit" id="ca-admin-go">Enter</button>
        <button class="ca-admin-cancel" id="ca-admin-cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  let pendingHref = '';

  function openAdminModal(href) {
    // If already on tools page, no gate needed
    if (isTools) { location.href = href; return; }
    pendingHref = href;
    document.getElementById('ca-admin-msg').textContent = '';
    document.getElementById('ca-admin-pw').value = '';
    modal.classList.add('open');
    setTimeout(() => document.getElementById('ca-admin-pw').focus(), 80);
  }

  function closeAdminModal() { modal.classList.remove('open'); }

  async function submitAdmin() {
    const pw = document.getElementById('ca-admin-pw').value;
    const msg = document.getElementById('ca-admin-msg');
    if (!pw) { msg.textContent = 'Enter the password.'; return; }
    msg.textContent = 'Checking…';
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', password: pw }),
      });
      const data = await res.json();
      if (data.ok) {
        sessionStorage.setItem('ca_admin_pw', pw);
        closeAdminModal();
        location.href = pendingHref;
      } else {
        msg.textContent = data.env_set === false ? 'Server not configured.' : 'Incorrect password.';
      }
    } catch {
      msg.textContent = 'Could not reach server.';
    }
  }

  modal.addEventListener('click', e => { if (e.target === modal) closeAdminModal(); });

  // Insert nav before everything else in body
  document.body.insertBefore(nav, document.body.firstChild);

  // Wire hamburger
  function closeDrawer() { drawer.classList.remove('open'); ham.classList.remove('open'); }
  ham.addEventListener('click', () => {
    const open = drawer.classList.toggle('open');
    ham.classList.toggle('open', open);
  });

  // Wire modal buttons (after body insert so elements exist)
  document.getElementById('ca-admin-go').addEventListener('click', submitAdmin);
  document.getElementById('ca-admin-cancel').addEventListener('click', closeAdminModal);
  document.getElementById('ca-admin-pw').addEventListener('keydown', e => { if (e.key === 'Enter') submitAdmin(); });

  // If already has a cached password (same session), skip gate
  const cached = sessionStorage.getItem('ca_admin_pw');
  if (cached) {
    // Silently stash it; the modal won't show since we check isTools inline
    // Tools page itself still requires its own password input
  }
})();
