// ==========================================================================
// BeeLert Web Dashboard - SaaS Application Logic
// ==========================================================================

// Global state cache
let dashboardData = null;
let databaseLogs = null;
let selectedPairIndex = 0;
let currentMemberFilter = 'all';
let currentLogTab = 'voice';

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
    if (!toast || !toastMsg) return;
    
    toast.style.borderColor = isError ? 'var(--color-danger)' : 'var(--accent-blurple)';
    toast.style.boxShadow = isError 
        ? '0 10px 25px -3px rgba(239, 68, 68, 0.4)' 
        : '0 10px 25px -3px rgba(88, 101, 242, 0.4)';
    
    toastMsg.innerHTML = isError 
        ? `<i class="fa-solid fa-circle-xmark" style="color: var(--color-danger); font-size: 1.1rem;"></i> <span>${message}</span>`
        : `<i class="fa-solid fa-circle-check" style="color: var(--color-success); font-size: 1.1rem;"></i> <span>${message}</span>`;
        
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4500);
}

// Format seconds into readable uptime string
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
        if (!isPolling) showToast('Failed to load status details.', true);
        return;
    }
    
    dashboardData = data;
    
    // Update DB Status indicator
    const dbBadge = document.getElementById('db-badge');
    const dbText = document.getElementById('db-status-text');
    if (dbBadge && dbText) {
        if (data.dbConfigured) {
            dbBadge.classList.add('db-active');
            dbText.innerText = 'DATABASE ONLINE';
        } else {
            dbBadge.classList.remove('db-active');
            dbText.innerText = 'DATABASE OFFLINE';
        }
    }

    // Update Bot Status indicator & metrics
    const botBadge = document.getElementById('bot-badge');
    const botText = document.getElementById('bot-status-text');
    const botUptime = document.getElementById('bot-uptime');
    const botMsgCount = document.getElementById('bot-msg-count');
    
    if (data.botStatus) {
        if (botBadge && botText) {
            if (data.botStatus.isOnline) {
                botBadge.classList.add('db-active');
                botText.innerText = 'BOT ONLINE';
            } else {
                botBadge.classList.remove('db-active');
                botText.innerText = 'BOT OFFLINE';
            }
        }
        
        if (botUptime) botUptime.innerText = formatUptime(data.botStatus.uptime);
        if (botMsgCount) botMsgCount.innerText = data.botStatus.totalMessagesSent?.toLocaleString() || '0';
    } else {
        if (botBadge && botText) {
            botBadge.classList.remove('db-active');
            botText.innerText = 'BOT OFFLINE';
        }
        if (botUptime) botUptime.innerText = '-';
        if (botMsgCount) botMsgCount.innerText = '-';
    }
    
    // Populate pair dropdown selector
    const select = document.getElementById('pair-select');
    if (select && (select.children.length <= 1 || !isPolling)) {
        select.innerHTML = '';
        data.pairs.forEach((pair, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.innerText = `Node Pair ${index + 1}: #${pair.communityProgressChannelId.substring(0, 6)}...`;
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
    const commServer = document.getElementById('cfg-comm-server');
    const commChannel = document.getElementById('cfg-comm-channel');
    const clanServer = document.getElementById('cfg-clan-server');
    const clanChannel = document.getElementById('cfg-clan-channel');
    
    if (commServer) commServer.innerText = pair.communityServerId;
    if (commChannel) commChannel.innerText = pair.communityProgressChannelId;
    if (clanServer) clanServer.innerText = pair.clanServerId;
    if (clanChannel) clanChannel.innerText = pair.clanReminderChannelId;
    
    // Scheduled times capsules
    const timeFirst = document.getElementById('time-first');
    const timeSecond = document.getElementById('time-second');
    const timeInactive = document.getElementById('time-inactive');
    
    if (timeFirst) timeFirst.innerText = pair.firstReminderTime || '--:--';
    if (timeSecond) timeSecond.innerText = pair.secondReminderTime || '--:--';
    if (timeInactive) timeInactive.innerText = pair.inactiveAlertTime || '--:--';
    
    // Calculate progress stats
    const totalMembers = pair.members.length;
    const postedMembers = pair.members.filter(m => m.hasPosted).length;
    const pct = totalMembers > 0 ? Math.round((postedMembers / totalMembers) * 100) : 0;
    
    // Liquid bar filling animation
    const liquidFill = document.getElementById('posted-liquid');
    const statText = document.getElementById('posted-stat-text');
    if (liquidFill) liquidFill.style.width = `${pct}%`;
    if (statText) statText.innerText = `${postedMembers} / ${totalMembers} (${pct}%)`;
    
    // Render member cards
    renderMembers(pair.members);
}

// 4. Render member grid based on active filter tab
function renderMembers(members) {
    const list = document.getElementById('members-list');
    if (!list) return;
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
        list.innerHTML = `<div class="no-members"><i class="fa-solid fa-user-slash" style="font-size: 2rem; margin-bottom: 12px; display: block; opacity: 0.4;"></i>No squad members match the selected filter.</div>`;
        return;
    }
    
    filtered.forEach(member => {
        const card = document.createElement('div');
        
        // Status classes & badge
        let statusClass = 'status-missing';
        let badgeHtml = `<span class="badge badge-missing"><i class="fa-solid fa-clock"></i> MISSING</span>`;
        if (member.hasPosted) {
            statusClass = 'status-submitted';
            badgeHtml = `<span class="badge badge-submitted"><i class="fa-solid fa-check"></i> SUBMITTED</span>`;
        } else if (member.isInactive) {
            statusClass = 'status-inactive';
            badgeHtml = `<span class="badge badge-inactive-2d"><i class="fa-solid fa-triangle-exclamation"></i> AFK 2D+</span>`;
        }
        
        card.className = `member-card ${statusClass}`;
        
        // Reminder indicator pills (dots indicating 9 PM, 11 PM, 10 AM alert state)
        const firstReminded = member.reminded.first ? 'active' : '';
        const secondReminded = member.reminded.second ? 'active' : '';
        const inactiveReminded = member.reminded.inactive ? 'active' : '';
        
        card.innerHTML = `
            <div class="member-card-top">
                <div class="member-avatar-wrapper">
                    <img src="${member.avatarUrl}" alt="${member.username}" class="member-avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                </div>
                <div class="member-info">
                    <div class="member-name" title="${member.displayName}">${member.displayName}</div>
                    <div class="member-id">@${member.username}</div>
                </div>
            </div>
            <div class="member-card-bottom">
                ${badgeHtml}
                <div class="remind-indicator-pills" title="Dispatch status: Green = 9 PM Alert, Blue = 11 PM DM, Amber = Inactivity Alert">
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
    
    const activeBtn = Array.from(btns).find(btn => 
        btn.innerText.toLowerCase().includes(type === 'all' ? 'all' : type === 'posted' ? 'subm' : type === 'unposted' ? 'miss' : 'afk')
    );
    if (activeBtn) activeBtn.classList.add('active');
    
    renderSelectedPair();
}

// 5. Trigger reminders manually
async function triggerReminder(type) {
    const btnMap = {
        first: '.btn-first, .btn-green',
        second: '.btn-second, .btn-cyan',
        inactive: '.btn-inactive, .btn-red'
    };
    
    const button = document.querySelector(btnMap[type]);
    if (button) {
        button.style.pointerEvents = 'none';
        button.style.opacity = '0.7';
    }
    
    showToast(`Dispatching manual ${type} notification...`);
    
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

// 6. Database logs fetching & rendering
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
    if (!headers || !body) return;
    
    if (!databaseLogs) {
        headers.innerHTML = `<th>Database Connection</th>`;
        body.innerHTML = `<tr><td class="center-text">Connecting to database...</td></tr>`;
        return;
    }
    
    if (!databaseLogs.dbConfigured) {
        headers.innerHTML = `<th>Database Status</th>`;
        body.innerHTML = `
            <tr>
                <td class="center-text" style="color: var(--color-danger);">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 8px; display: block;"></i>
                    Supabase connection is not configured or table does not exist.
                    <br><small style="color: var(--text-muted); margin-top: 6px; display: inline-block;">
                        Verify SUPABASE_URL and SUPABASE_KEY in environment configuration.
                    </small>
                </td>
            </tr>`;
        return;
    }
    
    body.innerHTML = '';
    
    if (currentLogTab === 'voice') {
        // Render 4-clan voice activity sessions
        headers.innerHTML = `
            <th>Clan</th>
            <th>Member</th>
            <th>Discord ID</th>
            <th>VC Channel ID</th>
            <th>Duration</th>
            <th>Session Date</th>
            <th>Logged At</th>
        `;

        const clanBadges = {
            'AURA': { emoji: '🟢', color: '#10b981', border: 'rgba(16, 185, 129, 0.4)' },
            'BELMONT': { emoji: '🔵', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.4)' },
            'LUMINA': { emoji: '🟣', color: '#a855f7', border: 'rgba(168, 85, 247, 0.4)' },
            'SHADASTRIA': { emoji: '🟠', color: '#f97316', border: 'rgba(249, 115, 22, 0.4)' }
        };

        const sessions = databaseLogs.voiceSessions || [];
        if (sessions.length === 0) {
            body.innerHTML = `<tr><td colspan="7" class="center-text">No 4-clan voice activity sessions found in database.</td></tr>`;
            return;
        }

        sessions.forEach(row => {
            const tr = document.createElement('tr');
            const clan = (row.clan_name || row.clanName || 'UNKNOWN').toUpperCase();
            const badge = clanBadges[clan] || { emoji: '🎙️', color: '#5865F2', border: 'rgba(88, 101, 242, 0.4)' };
            const displayName = row.display_name || row.displayName || row.username;
            const username = row.username || displayName;
            const dur = row.duration_seconds !== undefined ? row.duration_seconds : (row.durationSeconds || 0);
            const dateStr = row.session_date || row.sessionDate || '-';
            const joinTime = row.join_time || row.joinTime;
            const loggedTime = joinTime ? new Date(joinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
            const channelId = row.voice_channel_id || row.voiceChannelId || '-';

            // Duration format helper
            const durMin = Math.floor(dur / 60);
            const durSec = dur % 60;
            const durFormatted = durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`;

            tr.innerHTML = `
                <td>
                    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 11px; background: rgba(0,0,0,0.3); border: 1px solid ${badge.border}; color: ${badge.color};">
                        ${badge.emoji} ${clan}
                    </span>
                </td>
                <td>
                    <strong>${displayName}</strong>
                    ${username !== displayName ? `<br><small style="color: var(--text-muted)">@${username}</small>` : ''}
                </td>
                <td><code style="color: var(--color-info);">${row.discord_user_id || row.discordUserId}</code></td>
                <td><code>${channelId}</code></td>
                <td><span style="color: var(--color-success); font-weight: 700; font-family: var(--font-mono);">${durFormatted}</span></td>
                <td class="date-text">${dateStr}</td>
                <td class="date-text">${loggedTime}</td>
            `;
            body.appendChild(tr);
        });
    } else if (currentLogTab === 'voice-reports') {
        // Render 11 PM voice report logs
        headers.innerHTML = `
            <th>Report Date</th>
            <th>Active Members</th>
            <th>Total Voice Time</th>
            <th>Dispatched At</th>
            <th>Status</th>
        `;

        const reports = databaseLogs.voiceReports || [];
        if (reports.length === 0) {
            body.innerHTML = `<tr><td colspan="5" class="center-text">No 11 PM voice report logs found in database.</td></tr>`;
            return;
        }

        reports.forEach(row => {
            const tr = document.createElement('tr');
            const sentAt = row.sent_at || row.sentAt || row.created_at;
            const timeStr = sentAt ? new Date(sentAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-';
            const totalSec = row.total_seconds || row.totalSeconds || 0;
            const members = row.active_members_count || row.activeMembersCount || 0;
            const totalMin = Math.round(totalSec / 60);

            tr.innerHTML = `
                <td class="date-text"><strong>${row.report_date || row.reportDate || '-'}</strong></td>
                <td><span style="color: var(--color-warning); font-weight: 700;">${members} members</span></td>
                <td><span style="color: var(--color-success); font-weight: 700;">${totalMin} min (${totalSec}s)</span></td>
                <td class="date-text">${timeStr}</td>
                <td>
                    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: var(--radius-full); font-size: 11px; font-weight: 700; background: var(--color-success-bg); border: 1px solid var(--color-success-border); color: var(--color-success);">
                        <i class="fa-solid fa-check-double"></i> DISPATCHED
                    </span>
                </td>
            `;
            body.appendChild(tr);
        });
    } else if (currentLogTab === 'updates') {
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
                <td><code style="color: var(--color-info);">${row.discord_user_id}</code></td>
                <td><span style="color: var(--color-warning); font-weight: 700;">+${row.points_awarded} pts</span></td>
                <td>🔥 ${row.current_streak} days</td>
                <td class="date-text">${row.update_date}</td>
                <td class="date-text">${createdDate}</td>
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
                <td><code style="color: var(--color-info);">${row.discord_user_id}</code></td>
                <td><code>${row.community_progress_channel_id}</code></td>
                <td><span class="badge ${typeBadgeClass}">${row.reminder_type.toUpperCase()}</span></td>
                <td class="date-text">${row.reminder_date}</td>
                <td class="date-text">${createdTime}</td>
            `;
            body.appendChild(tr);
        });
    }
}

function switchLogTab(tab) {
    currentLogTab = tab;
    
    const btns = document.querySelectorAll('.logs-tabs-header .log-tab-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    
    const matchMap = {
        'voice': 'voice logs',
        'updates': 'progress',
        'reminders': 'reminder',
        'voice-reports': 'reports'
    };
    const targetText = matchMap[tab] || tab;
    const activeBtn = Array.from(btns).find(btn => btn.innerText.toLowerCase().includes(targetText));
    if (activeBtn) activeBtn.classList.add('active');
    
    renderLogTable();
}

// 7. Desktop & Mobile Sidebar Interactions
function toggleDesktopSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleIcon = document.getElementById('sidebar-toggle-icon');
    if (!sidebar) return;
    
    const isCollapsed = sidebar.classList.toggle('collapsed');
    if (toggleIcon) {
        toggleIcon.className = isCollapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left';
    }
    
    localStorage.setItem('beelert_sidebar_collapsed', isCollapsed ? '1' : '0');
}

function toggleMobileSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar || !backdrop) return;
    
    if (open) {
        sidebar.classList.add('open');
        backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        sidebar.classList.remove('open');
        backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Quick Refresh Function
async function refreshDashboard() {
    const icon = document.getElementById('refresh-icon');
    if (icon) icon.classList.add('fa-spin');
    
    await loadStatus();
    await loadDatabaseLogs();
    
    setTimeout(() => {
        if (icon) icon.classList.remove('fa-spin');
        showToast('Dashboard synchronized with live servers.');
    }, 500);
}

// Copy to Clipboard Helper
function copyText(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = el.innerText.trim();
    if (!text || text === '-') return;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${text} to clipboard!`);
    }).catch(err => {
        console.error('Clipboard copy failed:', err);
    });
}

// Update Live Time Banner Pill
function updateLiveTime() {
    const el = document.getElementById('current-live-time');
    if (!el) return;
    const now = new Date();
    el.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// 8. Event listeners & initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Restore desktop sidebar collapsed preference
    const savedCollapse = localStorage.getItem('beelert_sidebar_collapsed');
    if (savedCollapse === '1') {
        const sidebar = document.getElementById('sidebar');
        const toggleIcon = document.getElementById('sidebar-toggle-icon');
        if (sidebar) sidebar.classList.add('collapsed');
        if (toggleIcon) toggleIcon.className = 'fa-solid fa-chevron-right';
    }

    // Auto-close mobile drawer on link navigation
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                toggleMobileSidebar(false);
            }
        });
    });

    // Select dropdown listener
    const pairSelect = document.getElementById('pair-select');
    if (pairSelect) {
        pairSelect.addEventListener('change', (e) => {
            selectedPairIndex = parseInt(e.target.value, 10);
            renderSelectedPair();
        });
    }
    
    // Live clock update every second
    updateLiveTime();
    setInterval(updateLiveTime, 1000);

    // Initial fetch
    await loadStatus();
    await loadDatabaseLogs();
    
    // Poll updates every 15 seconds
    setInterval(async () => {
        await loadStatus(true);
        await loadDatabaseLogs();
    }, 15000);
});
