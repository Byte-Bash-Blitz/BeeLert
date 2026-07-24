// Global state cache
let dashboardData = null;
let databaseLogs = null;
let selectedPairIndex = 0;
let currentMemberFilter = 'all';
let currentLogTab = 'updates';

// Fetch API helper
async function apiRequest(url, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        return await response.json();
    } catch (e) {
        console.error(`API Error on ${url}:`, e);
        return { success: false, error: e.message };
    }
}

// 1. Toast notifications
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    
    toast.style.borderColor = isError ? 'var(--vp-pink)' : 'var(--vp-cyan)';
    toast.style.boxShadow = isError ? '0 0 20px var(--vp-pink-glow)' : '0 0 20px var(--vp-cyan-glow)';
    
    toastMsg.innerHTML = isError 
        ? `<i class="fa-solid fa-circle-xmark neon-pink-text"></i> ${message}`
        : `<i class="fa-solid fa-circle-check neon-cyan-text"></i> ${message}`;
        
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4500);
}

function formatUptime(seconds) {
    if (!seconds) return '0s';
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor((seconds % (3600*24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

// 2. Fetch and render status
async function loadStatus(isPolling = false) {
    const data = await apiRequest('/api/progress-reminder/status');
    if (!data || !data.success) {
        showToast('Failed to load status details.', true);
        return;
    }
    
    dashboardData = data;
    
    // Update DB Status indicator
    const dbBadge = document.getElementById('db-badge');
    const dbText = document.getElementById('db-status-text');
    if (data.dbConfigured) {
        dbBadge.classList.add('db-active');
        dbText.innerText = 'DATABASE ONLINE';
    } else {
        dbBadge.classList.remove('db-active');
        dbText.innerText = 'DATABASE OFFLINE';
    }

    // Update Bot Status indicator
    const botBadge = document.getElementById('bot-badge');
    const botText = document.getElementById('bot-status-text');
    const botUptime = document.getElementById('bot-uptime');
    const botMsgCount = document.getElementById('bot-msg-count');
    
    if (data.botStatus) {
        if (data.botStatus.isOnline) {
            botBadge.classList.add('db-active');
            botText.innerText = 'BOT ONLINE';
        } else {
            botBadge.classList.remove('db-active');
            botText.innerText = 'BOT OFFLINE';
        }
        
        if (botUptime) botUptime.innerText = formatUptime(data.botStatus.uptime);
        if (botMsgCount) botMsgCount.innerText = data.botStatus.totalMessagesSent;
    } else {
        botBadge.classList.remove('db-active');
        botText.innerText = 'BOT OFFLINE';
        if (botUptime) botUptime.innerText = '-';
        if (botMsgCount) botMsgCount.innerText = '-';
    }
    
    // Populate pair dropdown selector once
    const select = document.getElementById('pair-select');
    if (select.children.length <= 1 || !isPolling) {
        select.innerHTML = '';
        data.pairs.forEach((pair, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.innerText = `Pair ${index + 1}: Channel ${pair.communityProgressChannelId.substring(0, 6)}...`;
            select.appendChild(opt);
        });
        select.value = selectedPairIndex;
    }
    
    renderSelectedPair();
}

// 3. Render pair stats, configuration details, and members list
function renderSelectedPair() {
    if (!dashboardData || !dashboardData.pairs || dashboardData.pairs.length === 0) return;
    
    const pair = dashboardData.pairs[selectedPairIndex];
    if (!pair) return;
    
    // Configuration panel
    document.getElementById('cfg-comm-server').innerText = pair.communityServerId;
    document.getElementById('cfg-comm-channel').innerText = pair.communityProgressChannelId;
    document.getElementById('cfg-clan-server').innerText = pair.clanServerId;
    document.getElementById('cfg-clan-channel').innerText = pair.clanReminderChannelId;
    
    // Scheduled times capsules
    document.getElementById('time-first').innerText = pair.firstReminderTime;
    document.getElementById('time-second').innerText = pair.secondReminderTime;
    document.getElementById('time-inactive').innerText = pair.inactiveAlertTime;
    
    // Calculate progress stats
    const totalMembers = pair.members.length;
    const postedMembers = pair.members.filter(m => m.hasPosted).length;
    const pct = totalMembers > 0 ? Math.round((postedMembers / totalMembers) * 100) : 0;
    
    // Liquid bar filling animation
    const liquidFill = document.getElementById('posted-liquid');
    const statText = document.getElementById('posted-stat-text');
    liquidFill.style.width = `${pct}%`;
    statText.innerText = `${postedMembers} / ${totalMembers} (${pct}%)`;
    
    // Render member cards
    renderMembers(pair.members);
}

// 4. Render member grid based on active filter tab
function renderMembers(members) {
    const list = document.getElementById('members-list');
    list.innerHTML = '';
    
    let filtered = members;
    if (currentMemberFilter === 'posted') {
        filtered = members.filter(m => m.hasPosted);
    } else if (currentMemberFilter === 'unposted') {
        filtered = members.filter(m => !m.hasPosted);
    } else if (currentMemberFilter === 'inactive') {
        filtered = members.filter(m => m.isInactive);
    }
    
    if (filtered.length === 0) {
        list.innerHTML = `<div class="no-members">No members match the selected filter.</div>`;
        return;
    }
    
    filtered.forEach(member => {
        const card = document.createElement('div');
        
        // Status classes
        let statusClass = 'status-missing';
        let badgeHtml = `<span class="badge badge-missing">MISSING</span>`;
        if (member.hasPosted) {
            statusClass = 'status-submitted';
            badgeHtml = `<span class="badge badge-submitted">SUBMITTED</span>`;
        } else if (member.isInactive) {
            statusClass = 'status-inactive';
            badgeHtml = `<span class="badge badge-inactive-2d">INACTIVE (2D)</span>`;
        }
        
        card.className = `member-card ${statusClass}`;
        
        // Reminder indicator pills (glowing green/pink/yellow dots if reminded today)
        const firstReminded = member.reminded.first ? 'active' : '';
        const secondReminded = member.reminded.second ? 'active' : '';
        const inactiveReminded = member.reminded.inactive ? 'active' : '';
        
        card.innerHTML = `
            <div class="member-avatar-wrapper">
                <img src="${member.avatarUrl}" alt="${member.username}" class="member-avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
            </div>
            <div class="member-info">
                <div class="member-name">${member.displayName}</div>
                <div class="member-id">@${member.username}</div>
            </div>
            <div class="member-badges">
                ${badgeHtml}
                <div class="remind-indicator-pills" title="Reminder status dots: 1st (9 PM), 2nd (11 PM), Inactive (10 AM)">
                    <span class="pill pill-first ${firstReminded}" title="9:00 PM alert dispatched"></span>
                    <span class="pill pill-second ${secondReminded}" title="11:00 PM DM alert dispatched"></span>
                    <span class="pill pill-inactive ${inactiveReminded}" title="10:00 AM Inactivity alert dispatched"></span>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

// Filter button clicks
function filterMembers(type) {
    currentMemberFilter = type;
    
    const btns = document.querySelectorAll('.members-filter-bar .filter-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = Array.from(btns).find(btn => btn.innerText.toLowerCase().includes(type === 'all' ? 'all' : type === 'posted' ? 'subm' : type === 'unposted' ? 'miss' : 'inac'));
    if (activeBtn) activeBtn.classList.add('active');
    
    renderSelectedPair();
}

// 5. Trigger reminders manually
async function triggerReminder(type) {
    const btnMap = {
        first: '.btn-pink',
        second: '.btn-cyan',
        inactive: '.btn-purple'
    };
    
    const button = document.querySelector(btnMap[type]);
    if (button) {
        button.style.pointerEvents = 'none';
        button.style.opacity = '0.7';
    }
    
    showToast(`Triggering manual ${type} reminder execution...`);
    
    const response = await apiRequest('/api/progress-reminder/trigger', 'POST', {
        pairIndex: selectedPairIndex,
        type
    });
    
    if (button) {
        button.style.pointerEvents = 'auto';
        button.style.opacity = '1';
    }
    
    if (response && response.success) {
        showToast(response.message);
        // Reload statuses and DB logs immediately to reflect changes
        await loadStatus();
        await loadDatabaseLogs();
    } else {
        showToast(response.error || 'Failed to trigger reminder.', true);
    }
}

// 6. Database log logs fetching
async function loadDatabaseLogs() {
    const data = await apiRequest('/api/progress-reminder/database-logs');
    if (!data || !data.success) {
        console.warn('Failed to load database logs.');
        return;
    }
    
    databaseLogs = data;
    renderLogTable();
}

function renderLogTable() {
    const headers = document.getElementById('table-headers');
    const body = document.getElementById('table-body');
    
    if (!databaseLogs) {
        headers.innerHTML = `<th>Database Connection</th>`;
        body.innerHTML = `<tr><td class="center-text">Failed to connect.</td></tr>`;
        return;
    }
    
    if (!databaseLogs.dbConfigured) {
        headers.innerHTML = `<th>Database Logs</th>`;
        body.innerHTML = `
            <tr>
                <td class="center-text" style="color: var(--vp-pink);">
                    <i class="fa-solid fa-triangle-exclamation"></i> Supabase is not configured or logs table does not exist.
                    <br><small style="color: #a496b8; margin-top: 8px; display: inline-block;">
                        Run the SQL migrations inside migrations/create_progress_reminder_config.sql in Supabase to enable.
                    </small>
                </td>
            </tr>`;
        return;
    }
    
    body.innerHTML = '';
    
    if (currentLogTab === 'updates') {
        // Render progress updates
        headers.innerHTML = `
            <th>Username</th>
            <th>Discord ID</th>
            <th>Awarded Points</th>
            <th>Current Streak</th>
            <th>Update Date</th>
            <th>Logged At</th>
        `;
        
        const updates = databaseLogs.progressUpdates || [];
        if (updates.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="center-text">No progress updates found in database.</td></tr>`;
            return;
        }
        
        updates.forEach(row => {
            const tr = document.createElement('tr');
            const createdDate = new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            tr.innerHTML = `
                <td><strong>${row.username}</strong></td>
                <td><code style="color: var(--vp-cyan)">${row.discord_user_id}</code></td>
                <td><span style="color: var(--vp-yellow); font-weight: 700">+${row.points_awarded} pts</span></td>
                <td>🔥 ${row.current_streak} days</td>
                <td class="date-text">${row.update_date}</td>
                <td>${createdDate}</td>
            `;
            body.appendChild(tr);
        });
    } else {
        // Render reminder dispatch logs
        headers.innerHTML = `
            <th>Discord User ID</th>
            <th>Progress Channel ID</th>
            <th>Reminder Type</th>
            <th>Reminder Date</th>
            <th>Dispatched At</th>
        `;
        
        const logs = databaseLogs.reminderLogs || [];
        if (logs.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="center-text">No reminder logs found in database.</td></tr>`;
            return;
        }
        
        logs.forEach(row => {
            const tr = document.createElement('tr');
            const createdTime = new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            let typeBadgeClass = 'badge-submitted';
            if (row.reminder_type === 'first') typeBadgeClass = 'badge-submitted';
            else if (row.reminder_type === 'second') typeBadgeClass = 'badge-missing';
            else if (row.reminder_type === 'inactive') typeBadgeClass = 'badge-inactive-2d';
            
            tr.innerHTML = `
                <td><code style="color: var(--vp-cyan)">${row.discord_user_id}</code></td>
                <td><code>${row.community_progress_channel_id}</code></td>
                <td><span class="badge ${typeBadgeClass}">${row.reminder_type.toUpperCase()}</span></td>
                <td class="date-text">${row.reminder_date}</td>
                <td>${createdTime}</td>
            `;
            body.appendChild(tr);
        });
    }
}

function switchLogTab(tab) {
    currentLogTab = tab;
    
    const btns = document.querySelectorAll('.logs-tabs-header .log-tab-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = Array.from(btns).find(btn => btn.innerText.toLowerCase().includes(tab === 'updates' ? 'progress' : 'remind'));
    if (activeBtn) activeBtn.classList.add('active');
    
    renderLogTable();
}

// 7. Event listeners & initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Select dropdown listener
    document.getElementById('pair-select').addEventListener('change', (e) => {
        selectedPairIndex = parseInt(e.target.value, 10);
        renderSelectedPair();
    });
    
    // Initial fetch
    await loadStatus();
    await loadDatabaseLogs();
    
    // Poll updates every 15 seconds
    setInterval(async () => {
        await loadStatus(true);
        await loadDatabaseLogs();
    }, 15000);
});
