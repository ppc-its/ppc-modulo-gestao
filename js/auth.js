/* =========================
   PPC — Módulo de Autenticação
   ========================= */

const Auth = (() => {
    const STORAGE_KEY = 'ppc_session';
    const SESSION_TTL = 10 * 60 * 60 * 1000; // 10 horas


    const _users = [
        { email: 'f.liani@ppc.com.br',         password: '654321', name: 'Fabricio Liani',          role: 'admin',      area: null    },
        { email: 'higor.sapacosta@ppc.com.br', password: '654321', name: 'Higor Sapacosta',   role: 'admin',      area: null    },
        { email: 'victor.rodrigues@ppc.com.br', password: 'ppc123', name: 'Victor Rodrigues',   role: 'admin', area: 'null' },
        { email: 'ribeirao@ppc.com.br',    password: 'ppc123',name: 'Ribeirão',          role: 'user_area2', area: 'area2' },
    ];

    // Roles que têm acesso a cada página restrita
    const _pageRoles = {
        'graphs.html': ['admin'],
    };

    function _read() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const s = JSON.parse(raw);
            if (Date.now() > s.expires) { _drop(); return null; }
            return s;
        } catch {
            return null;
        }
    }

    function _drop() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // Retorna o objeto do usuário logado ou null
    function getUser() {
        const s = _read();
        return s ? s.user : null;
    }

    // Retorna o token JWT (null até o backend estar integrado)
    function getToken() {
        const s = _read();
        return s ? s.token : null;
    }

    function isAuthenticated() {
        return _read() !== null;
    }

    // Verifica acesso e redireciona se necessário.
    // roles: array opcional de roles permitidos, ex: ['admin']
    function requireAuth(roles) {
        const s = _read();

        if (!s) {
            const page = location.pathname.split('/').pop() || 'index.html';
            const qs = new URLSearchParams({ redirect: page });
            location.href = 'login.html?' + qs.toString();
            return false;
        }

        if (roles && !roles.includes(s.user.role)) {
            location.href = 'index.html';
            return false;
        }

        return true;
    }

    // Faz login. Retorna o objeto do usuário em caso de sucesso, lança erro em caso de falha.
    // Para integrar com o backend, substitua o bloco interno por:
    //   const r = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    //   if (!r.ok) throw new Error('E-mail ou senha inválidos.');
    //   const data = await r.json();
    //   localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: data.user, token: data.token, expires: data.expires }));
    //   return data.user;
    async function login(email, password) {
        const found = _users.find(
            u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
        );

        if (!found) throw new Error('E-mail ou senha inválidos.');

        const session = {
            user: { email: found.email, name: found.name, role: found.role, area: found.area },
            token: null,
            expires: Date.now() + SESSION_TTL,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        return session.user;
    }

    function logout() {
        _drop();
        location.href = 'login.html';
    }

    // Inicializa o chip de usuário no topbar (chame após requireAuth)
    function mountUserChip(chipId) {
        const chip = document.getElementById(chipId || 'userChip');
        if (!chip) return;

        const user = getUser();
        if (!user) return;

        const initials = user.name
            .split(' ')
            .slice(0, 2)
            .map(p => p[0].toUpperCase())
            .join('');

        const avatar = chip.querySelector('.user-avatar');
        const nameEl = chip.querySelector('.user-name');

        if (avatar) avatar.textContent = initials;
        if (nameEl)  nameEl.textContent = user.name;

        chip.style.display = 'inline-flex';
    }

    return { getUser, getToken, isAuthenticated, requireAuth, login, logout, mountUserChip };
})();

window.Auth = Auth;
