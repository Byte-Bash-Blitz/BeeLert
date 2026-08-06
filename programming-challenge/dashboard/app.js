async function fetchCurrentChallenge() {
    try {
        const res = await fetch('/api/challenge/current');
        const data = await res.json();
        if (data.success && data.challenge) {
            const ch = data.challenge;
            document.getElementById('ch-title').innerText = ch.title;
            document.getElementById('ch-desc').innerText = ch.description;
            document.getElementById('ch-diff').innerText = ch.difficulty;
            document.getElementById('ch-cat').innerText = ch.category;
            document.getElementById('ch-hint').innerText = ch.hint || 'No hint provided.';

            const tc = ch.testCases && ch.testCases.length > 0 ? ch.testCases[0] : null;
            document.getElementById('ch-input').innerText = tc ? JSON.stringify(tc.input, null, 2) : 'N/A';
            document.getElementById('ch-expected').innerText = tc ? JSON.stringify(tc.expected, null, 2) : 'N/A';
        }
    } catch (e) {
        console.error('Error fetching challenge:', e);
    }
}

async function fetchLeaderboard() {
    try {
        const res = await fetch('/api/challenge/leaderboard');
        const data = await res.json();
        if (data.success && data.leaderboard) {
            const tbody = document.getElementById('leaderboard-rows');
            if (data.leaderboard.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No users on leaderboard yet.</td></tr>';
                return;
            }
            const medals = ['🥇', '🥈', '🥉'];
            tbody.innerHTML = data.leaderboard.map((u, i) => `
                <tr>
                    <td><strong>${medals[i] || '#' + (i + 1)}</strong></td>
                    <td><span class="user-id">User ID: ${u.userId}</span></td>
                    <td><strong class="gold-text">${u.xp} XP</strong></td>
                    <td>${u.solved}</td>
                    <td>🔥 ${u.streak} Days</td>
                    <td>${u.accuracy}%</td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error('Error fetching leaderboard:', e);
    }
}

async function fetchQuestions() {
    try {
        const res = await fetch('/api/challenge/questions');
        const data = await res.json();
        if (data.success && data.questions) {
            const container = document.getElementById('questions-list');
            container.innerHTML = data.questions.map(q => `
                <div class="q-card">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span class="tag tag-diff">${q.difficulty}</span>
                        <span class="tag tag-cat">${q.category}</span>
                    </div>
                    <strong style="display: block; margin-bottom: 6px;">${q.title}</strong>
                    <p style="font-size: 12px; color: var(--text-muted);">${q.description.slice(0, 80)}...</p>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error('Error fetching questions:', e);
    }
}

async function fetchSystemStatus() {
    try {
        const res = await fetch('/status');
        const data = await res.json();
        if (data) {
            document.getElementById('sys-status').innerText = data.botOnline ? '200 OK (Online)' : '503 Offline';
            const hours = Math.floor(data.uptime / 3600);
            const mins = Math.floor((data.uptime % 3600) / 60);
            document.getElementById('sys-uptime').innerText = `${hours}h ${mins}m`;
        }
    } catch (e) {
        console.error('Error fetching status:', e);
    }
}

function updateCountdown() {
    const now = new Date();
    const next8AM = new Date(now);
    next8AM.setHours(8, 0, 0, 0);
    if (now >= next8AM) {
        next8AM.setDate(next8AM.getDate() + 1);
    }
    const diffMs = next8AM - now;
    const hours = Math.floor(diffMs / 3600000).toString().padStart(2, '0');
    const mins = Math.floor((diffMs % 3600000) / 60000).toString().padStart(2, '0');
    const secs = Math.floor((diffMs % 60000) / 1000).toString().padStart(2, '0');
    document.getElementById('countdown-timer').innerText = `${hours}:${mins}:${secs}`;
}

function showTab(tabName) {
    document.querySelectorAll('.tab-page').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

// Initial Load
window.addEventListener('DOMContentLoaded', () => {
    fetchCurrentChallenge();
    fetchLeaderboard();
    fetchQuestions();
    fetchSystemStatus();
    setInterval(updateCountdown, 1000);
    updateCountdown();
});
