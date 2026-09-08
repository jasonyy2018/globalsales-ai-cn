
// ============ 用户系统：登录 / 注册 / 会话 ============
window.currentUser = null;  // { username, role }

function switchAuthTab(tab) {
  var isLogin = (tab === 'login');
  // 选中态用的渐变要和 HTML 里写死的那条**逐字一致**，否则切一次 tab
  // 就会掉回实色，看着像 bug。
  var ON = 'linear-gradient(to right,#4f46e5,#9333ea)';
  document.getElementById('authFormLogin').style.display = isLogin ? 'block' : 'none';
  document.getElementById('authFormRegister').style.display = isLogin ? 'none' : 'block';
  document.getElementById('authTabLogin').style.background = isLogin ? ON : 'transparent';
  document.getElementById('authTabLogin').style.color = isLogin ? '#fff' : 'var(--text-secondary)';
  document.getElementById('authTabRegister').style.background = isLogin ? 'transparent' : ON;
  document.getElementById('authTabRegister').style.color = isLogin ? 'var(--text-secondary)' : '#fff';
}

function _authShowErr(id, msg) {
  var el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

async function authLogin() {
  var username = document.getElementById('authUsername').value.trim();
  var password = document.getElementById('authPassword').value;
  if (!username || !password) { _authShowErr('authError', '请输入用户名和密码'); return; }
  var btn = document.getElementById('authBtnLogin');
  btn.disabled = true; btn.textContent = '登录中...';
  try {
    var resp = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });
    var data = await resp.json();
    if (!data.success) { _authShowErr('authError', data.error || '登录失败'); return; }
    window.currentUser = data.user;
    await onLoggedIn();
  } catch (e) {
    _authShowErr('authError', '网络错误：' + (e && e.message || ''));
  } finally {
    btn.disabled = false; btn.textContent = '登录';
  }
}

async function authRegister() {
  var username = document.getElementById('regUsername').value.trim();
  var p1 = document.getElementById('regPassword').value;
  var p2 = document.getElementById('regPassword2').value;
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) { _authShowErr('authErrorReg', '用户名需 3-20 位字母/数字/下划线'); return; }
  if (p1.length < 6) { _authShowErr('authErrorReg', '密码至少 6 位'); return; }
  if (p1 !== p2) { _authShowErr('authErrorReg', '两次密码不一致'); return; }
  var btn = document.getElementById('authBtnRegister');
  btn.disabled = true; btn.textContent = '注册中...';
  try {
    var resp = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: p1 })
    });
    var data = await resp.json();
    if (!data.success) { _authShowErr('authErrorReg', data.error || '注册失败'); return; }
    window.currentUser = data.user;
    await onLoggedIn();
  } catch (e) {
    _authShowErr('authErrorReg', '网络错误：' + (e && e.message || ''));
  } finally {
    btn.disabled = false; btn.textContent = '注册';
  }
}

async function authLogout() {
  // ⑥ 退出前先把工作区存下来。
  // 不能指望 beforeunload —— 下面会把 currentUser 置 null，而 saveAppData 开头
  // 就 `if (!window.currentUser) return`，于是 reload 触发的那次保存直接空转，
  // 最后 2 秒（防抖窗口）内打的字会丢。
  try { await saveAppData(); } catch (e) {}
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  window.currentUser = null;
  location.reload();
}

// 登录成功后：隐藏门禁 → 应用角色可见性 → 加载用户数据 → 渲染
async function onLoggedIn() {
  _authShowErr('authError', ''); _authShowErr('authErrorReg', '');
  document.getElementById('authGate').style.display = 'none';
  if (typeof applyRoleVisibility === 'function') applyRoleVisibility(window.currentUser.role);
  if (typeof updateUserBadge === 'function') updateUserBadge();
  if (typeof bootAppData === 'function') { await bootAppData(); }
}

// 页面启动：先查会话状态
async function checkAuthAndBoot() {
  try {
    var resp = await fetch('/api/auth/me');
    var data = await resp.json();
    if (data && data.success && data.user) {
      window.currentUser = data.user;
      document.getElementById('authGate').style.display = 'none';
      if (typeof applyRoleVisibility === 'function') applyRoleVisibility(data.user.role);
      if (typeof updateUserBadge === 'function') updateUserBadge();
      if (typeof bootAppData === 'function') { await bootAppData(); }
      return;
    }
  } catch (e) {}
  // 未登录：显示门禁
  document.getElementById('authGate').style.display = 'flex';
}

// ============ 角色可见性 / 用户中心 / 用户管理 ============
// 普通用户隐藏：访客IP统计、社媒账号管理、用户管理
var RESTRICTED_SECTIONS = { 'ip-stats': true, 'accounts': true, 'users': true };

function applyRoleVisibility(role) {
  var isAdmin = (role === 'admin');
  var navIp = document.getElementById('nav-ip-stats');
  var navAcc = document.getElementById('nav-accounts');
  var navUsers = document.getElementById('nav-users');
  if (navIp) navIp.style.display = isAdmin ? '' : 'none';
  if (navAcc) navAcc.style.display = isAdmin ? '' : 'none';
  if (navUsers) navUsers.style.display = isAdmin ? '' : 'none';
  // 受限 section 用**类**而不是内联 style 来锁。
  // 单页导航靠 .section / .section.active 这一对规则控制显示，
  // 内联 display 优先级更高，会跟它打架：内联 none 的 section 即使加上
  // .active 也不显示，右侧就变成一片空白。.section-locked 带 !important，
  // 语义清楚（"这个用户没权限"），也不会污染 .active 的开关。
  ['section-ip-stats', 'section-accounts', 'section-users'].forEach(function(sid) {
    var el = document.getElementById(sid);
    if (!el) return;
    el.style.display = '';                 // 清掉历史遗留的内联值
    el.classList.toggle('section-locked', !isAdmin);
  });
  // 如果**当前停留的那一页**刚被锁掉，必须踢回一个安全页。
  // 触发路径是真实存在的：管理员停在「账号管理」上退出登录，
  // 换普通用户登进来 —— currentSection 还是 accounts，那页被锁着不显示，
  // 而单页导航下没有别的页是 .active，右侧就是彻底空白，用户只能刷新。
  if (!isAdmin && RESTRICTED_SECTIONS[currentSection]) {
    scrollToSection('hotspot');
  }
}

function updateUserBadge() {
  var u = window.currentUser;
  if (!u) return;
  var initial = (u.username || 'U').charAt(0).toUpperCase();
  var roleLabel = (u.role === 'admin')
    ? (window.currentLang === 'en' ? 'Administrator' : '管理员')
    : (window.currentLang === 'en' ? 'User' : '普通用户');
  var set = function(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
  set('userBadgeAvatar', initial);
  set('userBadgeName', u.username);
  set('userBadgeRole', roleLabel);
  set('ucAvatar', initial);
  set('ucName', u.username);
  set('ucRole', roleLabel);
}

async function ucChangePassword() {
  var oldPw = document.getElementById('ucOldPw').value;
  var newPw = document.getElementById('ucNewPw').value;
  var newPw2 = document.getElementById('ucNewPw2').value;
  var msg = document.getElementById('ucMsg');
  function show(t, ok) { msg.textContent = t; msg.style.color = ok ? '#22c55e' : '#ef4444'; msg.style.display = 'block'; }
  if (newPw.length < 6) { show('新密码至少 6 位', false); return; }
  if (newPw !== newPw2) { show('两次新密码不一致', false); return; }
  var btn = document.getElementById('ucBtnChange');
  btn.disabled = true;
  try {
    var resp = await fetch('/api/auth/change_password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: oldPw, new_password: newPw })
    });
    var d = await resp.json();
    if (!d.success) { show(d.error || '修改失败', false); return; }
    show('✅ 密码已修改，即将重新登录...', true);
    setTimeout(function() { location.reload(); }, 1500);
  } catch (e) {
    show('网络错误', false);
  } finally {
    btn.disabled = false;
  }
}

async function renderUsersTable() {
  if (!window.currentUser || window.currentUser.role !== 'admin') return;
  var body = document.getElementById('usersTableBody');
  if (!body) return;
  try {
    var resp = await fetch('/api/admin/users');
    var d = await resp.json();
    if (!d.success) { body.innerHTML = '<tr><td colspan="6">' + (d.error || 'error') + '</td></tr>'; return; }
    var html = '';
    for (var i = 0; i < d.users.length; i++) {
      var u = d.users[i];
      var isAdmin = (u.role === 'admin');
      html += '<tr>'
        + '<td>' + u.id + '</td>'
        + '<td style="font-weight:600;">' + escapeHtml(u.username) + '</td>'
        + '<td>' + (isAdmin ? '<span style="color:var(--accent-light);font-weight:600;">admin</span>' : 'user') + '</td>'
        + '<td>' + (u.assets || 0) + '</td>'
        + '<td style="font-size:12px;color:var(--text-secondary);">' + (u.created_at || '').slice(0, 10) + '</td>'
        + '<td>'
          + '<button class="btn btn-outline btn-sm" onclick="adminResetPw(' + u.id + ',\'' + escapeHtml(u.username) + '\')" style="margin-right:6px;">重置密码</button>'
          + (isAdmin ? '' : '<button class="btn btn-outline btn-sm" onclick="adminDeleteUser(' + u.id + ',\'' + escapeHtml(u.username) + '\')" style="color:#ef4444;border-color:#ef444455;">删除</button>')
        + '</td>'
        + '</tr>';
    }
    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<tr><td colspan="6">加载失败</td></tr>';
  }
}

async function adminResetPw(id, username) {
  var np = prompt('为用户「' + username + '」设置新密码（至少6位）：');
  if (np === null) return;
  if (np.length < 6) { showToast('密码至少 6 位'); return; }
  var resp = await fetch('/api/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, new_password: np })
  });
  var d = await resp.json();
  showToast(d.success ? '✅ 已重置 ' + username + ' 的密码' : ('⚠️ ' + (d.error || '失败')));
}

async function adminDeleteUser(id, username) {
  if (!confirm('确定删除用户「' + username + '」？其所有资产/配置将一并删除，不可恢复。')) return;
  var resp = await fetch('/api/admin/users', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id })
  });
  var d = await resp.json();
  if (d.success) { showToast('✅ 已删除 ' + username); renderUsersTable(); }
  else showToast('⚠️ ' + (d.error || '删除失败'));
}

// ============ Phase 1.1-1.2 · i18n 骨架 ============
// 单文件 SPA 下把词典内嵌，零请求、零第三方依赖。key 使用 module.sub 形式便于分组维护。
window.I18N = {
  zh: {
    'app.title': '自媒体AI运营平台',
    'app.status.ok': '所有服务正常运行',
    'app.status.label': '当前状态',
    'app.logout': '退出登录',

    'nav.hotspot': '热点发现',
    'nav.hotspot.badge': '实时',
    'nav.product': '商品情报抓取',
    'nav.product.badge': 'URL',
    'nav.article': '图文生成',
    'nav.video': '视频生成',
    'nav.image': '图片创作',
    'nav.text_studio': '文案创作',
    'nav.freeqa': '自由问答',
    'freeqa.title': '自由问答',
    'freeqa.subtitle': '像和人聊天一样提问：支持联网搜索、语音输入、上传图片/参考图。回答支持富文本、一键复制与导出。',
    'freeqa.placeholder': '问点什么…（Enter 发送，Shift+Enter 换行，可拖拽或粘贴图片）',
    'freeqa.send': '发送',
    'freeqa.sending': '思考中…',
    'freeqa.voice': '语音输入',
    'freeqa.image': '图片/参考图',
    'freeqa.websearch': '联网搜索',
    'freeqa.clear': '清空对话',
    'freeqa.copy': '复制',
    'freeqa.export': '导出',
    'freeqa.empty': '还没有对话。在上面输入框问点什么试试 👆',
    'freeqa.you': '我',
    'freeqa.ai': 'AI',
    'freeqa.searching': '正在联网搜索…',
    'freeqa.chat_title': '对话记录',
    'freeqa.order_hint': '（最新在最上）',
    'freeqa.export_all': '导出全部',
    'nav.commerce_platforms': '主流电商平台',
    'nav.social_platforms': '主流社媒平台',
    'nav.video_create': '视频创作',
    'nav.comment': '热门评论衍生',
    'nav.smart_reply': '棘手评论回复',
    'nav.accounts': '账号管理',
    'nav.assets': '自媒体资产',
    'nav.ip_stats': '访客IP统计',
    'nav.prompts': '提示词配置',
    'nav.models': '大模型配置',
    'nav.demo': '操作演示',
    'nav.user_center': '用户中心',
    'nav.users': '用户管理',
    'demo.title': '🎬 操作演示',
    'demo.subtitle': '完整操作流程视频演示 · 支持拖动进度条、倍速与全屏',
    'demo.hint': '视频分片加载（边下边播），拖动进度条会自动请求对应片段，无需等待整段下载完成。',
    'demo.unsupported': '当前浏览器不支持内嵌视频播放，请下载后观看。',
    'demo.error': '演示视频加载失败。可能是服务器上没有 demo.mp4（部署时被排除了），或网络中断。',
    'demo.download': '直接下载',
    'uc.title': '👤 用户中心',
    'uc.subtitle': '查看账户信息并修改登录密码',
    'uc.change_pw': '修改密码',
    'uc.old_pw': '当前密码',
    'uc.new_pw': '新密码（至少6位）',
    'uc.new_pw2': '确认新密码',
    'uc.submit': '保存新密码',
    'uc.workspace': '工作区',
    'uc.workspace_hint': '输入框内容、商品情报、当前文章会自动保存，刷新或重新登录后自动恢复。如果某个状态卡住了，可以在这里清空。已保存的资产不受影响。',
    'uc.clear_workspace': '🧹 清空工作区',
    'um.title': '👥 用户管理',
    'um.subtitle': '查看所有注册用户、重置密码、删除账户（仅管理员）',
    'um.col.username': '用户名',
    'um.col.role': '角色',
    'um.col.assets': '资产数',
    'um.col.created': '注册时间',
    'um.col.actions': '操作',

    'hotspot.title': '热点话题发现',
    'hotspot.subtitle': '实时追踪抖音 / 小红书 / 视频号 / B站 / 微博 等国内主流自媒体与电商平台热点，围绕品牌方向生成图文与视频',
    'hotspot.source.label': '搜索源：',
    'hotspot.source.cn': '🔍 全网搜索（Bing/百度）',
    'hotspot.source.news': '📰 资讯聚合（AI 情报）',
    'hotspot.search.placeholder.cn': '输入你关注的主题，全网搜索国内电商 / 自媒体运营热点...',
    'hotspot.search.placeholder.news': '输入关键词，AI 聚合国内电商 / 自媒体热点（如：直播带货、抖音新规）...',
    'hotspot.kw.hint': '🔥 领域关键词（点击直接搜）：',
    'hotspot.filter.all': '全部热点',
    'hotspot.filter.ai': 'AI 技术',
    'hotspot.filter.short_video': '短视频',
    'hotspot.filter.content': '内容创作',
    'hotspot.filter.platform': '平台动态',
    'hotspot.filter.trend': '行业趋势',
    'hotspot.filter.monetize': '变现运营',
    'hotspot.btn.search': '全网搜索',
    'hotspot.btn.refresh': '全网刷新',
    'hotspot.update_time': '最后更新：',
    'hotspot.card.gen_article': '以此话题生成文章',
    'hotspot.card.gen_script': '生成脚本+视频',
    'hotspot.card.boom': '爆款拆解',
    'hotspot.card.hotness': '热度',
    'hotspot.card.view_source': '查看来源',

    'product.title': '商品情报抓取',
    'product.subtitle': '粘贴商品链接，AI 自动抓取标题、卖点与图片，作为图文/脚本/视频的生成素材。注意：淘宝天猫、京东、拼多多、抖音商城等平台的商品页有反爬限制，多数抓不到，遇到失败请把标题与卖点手工粘到「副文本」区',
    'product.url.label': '商品链接 URL',
    'product.url.placeholder': '例：https://product.dangdang.com/1125243395.html',
    'product.btn.scrape': '抓取商品信息',
    'product.samples.hint': '💡 没有链接？点下面任一示例商品页，一键体验抓取效果：',
    'product.btn.clear': '清空商品上下文',
    'product.loading': '正在解析商品页面，抓取标题、卖点与主图...',
    'product.empty.title': '还没有抓取任何商品',
    'product.empty.hint': '粘贴一个国内电商商品链接，AI 会解析出商品信息并注入到后续图文/视频生成流程',
    'product.cta.article': '以此商品生成图文',
    'product.cta.script': '以此商品生成脚本+视频',

    'article.title': '图文文章生成',
    'article.subtitle': '面向小红书、微信公众号、今日头条、知乎、微博的国内自媒体图文引擎 · 生成后一键跳转至对应平台后台，由你登录发布',
    'article.topic.label': '文章主题',
    'article.topic.placeholder': '输入你想写的文章主题，或从热点发现中选择...',
    'article.platform.label': '目标平台：',
    'article.model.label': '文案模型：',
    'article.btn.text_only': '① 生成纯文本',
    'article.btn.full': '①+② 一步到位',
    'article.btn.insert_images': '② 一键配图（3 张）',
    'article.btn.regen_text': '🔄 重新生成文本',
    'article.btn.open_editor': '✏️ 打开全屏编辑器',
    'article.btn.publish': '🚀 跳转平台后台发布',
    'article.badge.draft': '📝 草稿 · 无图',
    'article.hint.step': '✅ Phase 2.1 分步生成 · 文字已就绪，可直接在框内修改；确认后点击「② 一键配图」自动分析文段插入 3 张匹配图。',

    'video.title': '短视频生成',
    'video.subtitle': '由图文或商品情报驱动的短视频引擎 · 默认使用 Seedance 2 Mini · 生成后一键跳转至抖音 / 快手 / 视频号 / 小红书 后台上传',
    'video.source.label': '选择素材来源',
    'video.source.placeholder': '从已生成的文章中选择...',
    'video.platform.label': '发布平台：',
    'video.model.label': '视频模型：',
    'video.duration.label': '视频时长：',
    'video.btn.gen_script': '生成短视频脚本',
    'video.btn.copy': '复制脚本',
    'video.btn.export': '📄 导出脚本',
    'video.btn.edit': '编辑脚本',
    'video.btn.gen_single': '生成单段视频',
    'video.btn.gen_full': '生成完整成片',
    'video.btn.publish': '跳转平台后台上传',
    'video.preview.empty': '生成脚本后将在此预览视频',

    'common.btn.save': '保存',
    'common.btn.cancel': '取消',
    'common.btn.close': '关闭',
    'common.btn.confirm': '确认',
    'common.loading': '正在加载...',

    'ts.title': '📝 文案创作',
    'ts.subtitle': '输入你的文案主题，AI 生成贴合国内平台调性的中文文案。可用于软文推广、短视频脚本、种草笔记、私域推文等。默认使用火山方舟 Coding Plan。',
    'ts.prompt.label': '你的文案主题',
    'ts.prompt.placeholder': '例如：为智能猫砂盆写一篇小红书种草笔记；写一段抖音带货口播脚本；为新品测款写 5 条微博文案等...',
    'ts.chip.hint': '🔥 热门国内电商 / 自媒体运营提示词',
    'ts.chip.subhint': '（点击一键填充）',
    'ts.type.label': '文案类型：',
    'ts.type.article': '软文推广',
    'ts.type.script': '视频脚本',
    'ts.type.short_form': '短平快帖子',
    'ts.type.private': '私域推文',
    'ts.platform.label': '目标平台：',
    'ts.btn.optimize': 'AI 优化提示词',
    'ts.btn.voice': '语音输入',
    'ts.voice.hint': '🎙 支持语音输入：点「语音输入」直接口述文案主题，按中文识别。识别由浏览器完成，音频不经过本站服务器。需 Chrome / Edge / Safari。',

    'ts.btn.generate': '生成文案',
    'ts.loading': '火山方舟正在为你打磨平台本土化文案，5–15 秒...',
    'ts.result.title': '生成结果',
    'ts.btn.copy': '📋 复制全文',
    'ts.btn.export': '📄 导出为 .html',
    'ts.btn.regen': '🔄 重新生成',
    'ts.saved.assets': '已保存到自媒体资产',

    'cp.title': '🛒 国内主流电商平台',
    'cp.subtitle': '国内电商平台选型表 · 面向人群 · 访问入口 · 适合品类 · 佣金费率 · 入驻规则 · 流量玩法 · 平台亮点',
    'cp.col.platform': '平台',
    'cp.col.audience': '面向人群',
    'cp.col.entry': '访问入口',
    'cp.col.fit': '适合场景 / 品类',
    'cp.col.fees': '手续费 / 佣金',
    'cp.col.rule': '入驻规则',
    'cp.col.traffic': '流量玩法',
    'cp.col.notes': '平台亮点 / 避坑',

    'sp.title': '📱 主流社媒平台',
    'sp.subtitle': '国内主流自媒体平台选型表 · 访问入口 · 内容形式 · 目标人群 · 推流算法规则 · 平台亮点与避坑',
    'sp.col.platform': '平台',
    'sp.col.entry': '访问入口',
    'sp.col.format': '主要内容形式',
    'sp.col.audience': '目标人群',
    'sp.col.algo': '流量 / 推流算法规则',
    'sp.col.notes': '平台亮点 / 避坑',

    'nav.holidays': '国内营销节日',
    'hol.title': '🇨🇳 国内营销节日',
    'hol.subtitle': '国内全年电商大促与营销节点清单 · 按时间排序 · S/A/B 运营分级 · 备货 / 内容 / 社媒准备动作',
    'hol.tier.s.name': '战略级 Strategic',
    'hol.tier.s.desc': '80% 营销预算倾斜。全民购物心智，单节点可占全年 GMV 15% 以上，需提前 30–45 天启动。会场报名 + 蓄水加购 + 大额券与满减 + 50+ KOC 铺量 + 2–3 场垂类达人直播 + 千川/引力魔方放量 100–300%。备货按日销 8–15 倍。',
    'hol.tier.a.name': '重要级 Advanced',
    'hol.tier.a.desc': '15% 预算。强送礼或刚需场景，热度远不及 S 级，窗口期仅 3–7 天。换一批节日选题与封面、小额专属券、少量 KOC 补种草内容，主要吃自然流量少量加投。备货按日销 2–4 倍。',
    'hol.tier.b.name': '基础级 Basic',
    'hol.tier.b.desc': '5% 以内甚至 0 预算。热度区域性强或仅小众品类受益，工作量大于收益。只在文案与话题里带上节日关键词蹭一波自然流量，不做专属优惠、不找达人、不加投。',
    'hol.mnemonic': '一句话口诀：S 重仓干，A 正常干，B 顺带蹭一下',
    'hol.col.date': '时间',
    'hol.col.name': '节日',
    'hol.col.tier': '分级',
    'hol.col.feature': '节日特点',
    'hol.col.category': '主推品类',
    'hol.col.action': '备货 / 内容 / 社媒动作',
    'hol.col.hook': '选题钩子 / 促销机制',
    'hol.utm.title': '🔗 配套追踪 + 促销机制体系',
    'hol.utm.body': '每个节点单独一套追踪口径（抖音用巨量星图任务 ID、小红书用蒲公英合作 ID、站外用 UTM）+ 专属促销机制（专属券码、满减档位、赠品 SKU、直播间专享价）。大促前 2–3 周启动 KOC 种草蓄水，开门红当天放量投千川 / 引力魔方 / 万相台。没有追踪口径和专属机制的内容，等于花了精力却算不清账。',

    'nav.metrics': '电商运营指标',
    'met.title': '📊 电商运营指标',
    'met.subtitle': '国内电商运营核心指标 · 流量层 / 转化层 / 回报层 / 留存层 · 国内平台基准与误用提醒',
    'met.intro': '电商运营不只是「卖货」，是「算账」。投了 1 万元千川，必须回答这 1 万带回多少 GMV、多少净利。口径不统一，账永远算不清 —— 所以下面 8 个指标是结果，「统一口径」才是第一性原理。',
    'met.col.layer': '层级',
    'met.col.name': '指标',
    'met.col.abbr': '缩写',
    'met.col.bench': '国内参考基准',
    'met.col.good': '优秀阈值',
    'met.col.watch': '盯什么',
    'met.col.trap': '误用提醒',
    'met.caliber.title': '📏 口径统一表（否则会乱）',
    'met.caliber.col.dim': '维度',
    'met.caliber.col.rule': '统一口径',
    'met.caliber.col.wrong': '反例（常犯）',
    'met.formula.title': '🧮 CTR / CVR 公式与三种 CVR 算法',
    'met.ctr.note': '分母陷阱：「展示」= 一人看 3 次算 3 次，「触达」= 算 1 次，平台后台基本都用展示。抖音以 3 秒完播作为有效观看口径，小红书划过即计曝光。CTR 不是「广告好不好」，是「前 3 秒有没有抓住用户」。',
    'met.cvr.note': '分子必须是「支付成功」而非「加购」或「下单」：国内从下单到支付仍有 20–40% 流失（凑单取消、比价流失、超时未付），用加购算会严重虚高。分母平台后台默认用商品访客数（UV），自建报表要保持同一口径。',
    'met.gmv.note': '投流优化不是把 CTR 拉满，而是在 AOV 固定的前提下找 CTR × CVR 乘积最大。单独看任何一个都会骗人。',
    'met.cvr3.title': '同一个站点（1000 访问 / 80 加购 / 30 下单 / 12 支付成功），三种算法差 6.7 倍：',
    'met.cvr3.col.ver': '算法版本',
    'met.cvr3.col.formula': '公式',
    'met.cvr3.col.result': '结果',
    'met.cvr3.col.use': '用途',
    'met.cvr3.warn': '⚠️ 国内电商后台的「转化率」默认指支付转化率（成交率）。拿 8% 的加购率报给老板，是把数据当装饰品。',
    'met.case.title': '💡 实战案例',
    'met.case.col.scene': '场景',
    'met.case.col.pain': '痛点',
    'met.case.col.wrong': '错误做法',
    'met.case.col.right': '正确做法',
    'met.case.col.result': '结果',
    'met.summary': '一句话总结：CTR 看「抓眼」，CVR 看「抓心」，GMV 看「抓钱」。三个数一起盯，才不会被单点优化骗了。',

    'nav.model_shop': '大模型选购',
    'ms.title': '🛒 大模型选购',
    'ms.subtitle': '国内主流大模型采购清单 · 按性价比排序（免费 → 费用低 → 费用高）· 购买入口 / 多模态支持 / 优缺点 / 套餐价格 / API 接入文档',
    'ms.intro': '选模型不是选「最强的」，是选「够用且算得过账的」。自媒体内容生产的实际负载是：大量中短文本 + 大量配图 + 少量视频。所以真正决定成本的是图片单价和文本每百万 token 价格，不是榜单排名。建议路径：先用免费档跑通流程 → 用量上来后换到费用低的国产模型做主力 → 只在关键文案/关键创意上调用高价旗舰。',
    'ms.tier.free.badge': '免费',
    'ms.tier.free.name': '零成本起步',
    'ms.tier.free.desc': '有免费额度或完全免费的网关。适合跑通流程、验证提示词。缺点是限流、并发低、稳定性无 SLA，不要拿来做生产主力。',
    'ms.tier.low.badge': '费用低',
    'ms.tier.low.name': '量产主力',
    'ms.tier.low.desc': '每百万 token 个位数到十几元人民币。国产模型集中在这一档，是日更内容的成本最优解。',
    'ms.tier.mid.badge': '费用中',
    'ms.tier.mid.name': '质量兜底',
    'ms.tier.mid.desc': '中等 API 价格档。适合文案终稿、需要更强逻辑与文笔的长文与品牌级内容。',
    'ms.tier.high.badge': '费用高',
    'ms.tier.high.name': '关键创意',
    'ms.tier.high.desc': '旗舰模型或高价视频模型。只在关键 campaign、品牌级创意上按次调用，不进日常流水线。',
    'ms.col.tier': '档位',
    'ms.col.name': '模型 / 平台',
    'ms.col.vendor': '厂商 / 地区',
    'ms.col.modal': '多模态支持',
    'ms.col.price': '套餐价格',
    'ms.col.buy': '购买入口',
    'ms.col.pros': '亮点 / 优点',
    'ms.col.cons': '缺点 / 注意',
    'ms.col.doc': 'API 接入文档',
    'ms.price.disclaimer': '⚠️ 价格为整理时的公开报价，厂商调价频繁；下单前请以「购买入口」页面的实时价格为准。表内不含任何 API Key —— 请到各厂商控制台自行申请。',
    'ms.agnes.title': '🆓 免费首选：AGNES AI 接入实操',
    'ms.agnes.intro': '新加坡 AGNES AI 是一个 AI Gateway，提供免费的全模态模型（文本 / 图像 / 视频），走 OpenAI 兼容协议，所以任何支持「自定义 OpenAI 兼容端点」的工具都能直接接（包括本站的「大模型配置 → 添加模型」）。',
    'ms.agnes.f.home': '官网',
    'ms.agnes.f.key': '申请 API Key',
    'ms.agnes.f.key.note': ' —— 登录后进入 API Key 页面，创建并复制',
    'ms.agnes.f.provider.note': '（提供商列表滑到最后，选「其他 / Custom」）',
    'ms.agnes.f.model.note': '（模型 ID 区分大小写，建议直接从平台复制）',
    'ms.agnes.f.doc': '文档 / FAQ',
    'ms.agnes.f.doc.wb': 'WorkBuddy 接入 ↗',
    'ms.agnes.warn': '⚠️ 图像和视频模型不走 chat 端点：在支持 Skill / 工具的客户端里，让它读 https://agnes-ai.com/doc/overview 自动生成生图、生视频的调用封装即可。视频任务是异步的，提交后要轮询任务状态才能拿到视频 URL。',
    'ms.trouble.title': '🔧 接入失败排查',
    'ms.trouble.col.sym': '现象',
    'ms.trouble.col.cause': '原因',
    'ms.trouble.col.fix': '怎么修',
    'ms.summary': '一句话总结：免费档用来验证，国产低价档用来量产，中价档用来把关键文案磨到能直接发布，旗舰档只在关键创意上按次买。别用一个模型打所有场景 —— 那是最贵的做法。',

    'nav.sourcing': '选品',
    'nav.sourcing.badge': 'AI',
    'src.title': '🛒 选品',
    'src.subtitle': '输入品类或品牌关键词，AI 从京东 / 天猫 / 拼多多 / 抖音商城等国内电商与自媒体讨论中挖掘近一个月的热销候选品，按「自定义客单价区间 + 好评率高」筛选后输出可核对的选品表',
    'src.intro': '选品的本质是找「需求已被验证、竞争还没饱和」的价格带。价格区间自己填：低价带（0–100 元）拼的是供应链极限成本和退货率，靠拼多多 / 抖音低价爆量；中价带（100–500 元）是内容种草转化最舒服的区间，短视频和直播都能带；高价带（500 元以上）决策周期长、更依赖专业内容与信任背书，适合京东 / 天猫 / 视频号。',
    'src.filter.label': '筛选条件：',
    'src.filter.price': '客单价（元）',
    'src.filter.price.min': '不限',
    'src.filter.price.max': '不限',
    'src.filter.rating': '好评率 ≥',
    'src.search.placeholder': '输入品类或品牌关键词，例如：智能猫砂盆 / 电动升降桌 / 露营装备',
    'src.kw.hint': '🎯 选品关键词（点击直接分析）：',
    'src.btn.run': '开始选品分析',
    'src.btn.copy': '复制表格',
    'src.hint.time': '首次分析约需 20–50 秒',
    'src.disclaimer': '⚠️ 数据说明：「搜同款」是按平台 + 商品名拼的**平台搜索链接**（一定打得开，点开是该平台在售的同款列表）；「参考来源」只在本次实时抓到过该链接时才出现，多为榜单/测评文章，不一定是商品详情页。本页**不提供商品详情页直链** —— 详情页地址里带商品 ID，AI 拿不到真实 ID，给出来的必然是打不开或对不上的死链。销量 / 客单价 / 好评差评比例来自公开讨论与榜单的区间估算，国内电商平台不开放这些数字的公开接口。抓不到的字段一律标 N/A，不会用编造值填充。下单前请点「搜同款」核对实际商品与价格。',
    'src.col.name': '商品名称 / 标题',
    'src.col.link': '平台 / 搜同款',
    'src.col.sales': '近一个月销量',
    'src.col.aov': '客单价',
    'src.col.feature': '特点备注',
    'src.col.good': '好评率',
    'src.col.bad': '差评率',
    'src.col.goodwhy': '好评集中在',
    'src.col.badwhy': '差评集中在',
    'src.col.buyer': '购买人群 / 年龄段',
    'src.empty.title': '没有筛选出符合条件的候选品',
    'src.empty.hint': '试试放宽价格区间，或换一个更具体的品类词（例如「电动升降桌」而不是「家具」）',

    'image.title': '图片创作',
    'image.subtitle': '上传参考图 + 描述你的想法，AI 为你生成高质量图片。适用于电商主图、种草配图、社媒广告、达人人设图等场景。',
    'image.ref.label': '参考图（可选）',
    'image.ref.upload': '点击上传参考图，或直接拖拽到此处',
    'image.ref.formats': '支持 JPG / PNG / WebP，最大 10MB',
    'image.prompt.label': '图片描述',
    'image.prompt.placeholder': '描述你想要的图片，例如：电商主图、小红书种草平铺图、美食探店大片、型男穿搭街拍等...',
    'image.prompt.optimize': 'AI优化提示词',
    'image.prompt.optimize.hint': '输入简单主题后，可用上面选的文本模型优化成专业级生图提示词',
    'image.chip.hint': '热门提示词',
    'image.chip.hint.subtitle': '（点击快速填充）',
    'image.model.label': '模型',
    'image.num.label': '数量',
    'image.btn.generate': '生成图片',
    'image.result.title': '生成结果',
    'image.btn.regen': '重新生成',
    'image.loading': 'AI 正在创作中，请稍候...',
    'image.loading.hint': '生成 3 张图片通常需要 5-10 秒；提示词直接以中文喂给国内生图模型，画面内文字约束为简体中文',

    'vc.title': '🎬 视频创作',
    'vc.subtitle': '输入视频描述并上传参考图片，AI 为你生成高质量短视频。适用于抖音 / 快手 / 视频号 / 小红书 / B站 的带货与种草内容。',
    'vc.prompt.title': '🎯 视频提示词',
    'vc.prompt.subtitle': '（描述你想生成的视频内容，画面文字与字幕以中文为准）',
    'vc.prompt.placeholder': '例如：开箱测评、产品功能演示、达人探店、直播预告、国潮大片等...',
    'vc.prompt.optimize': 'AI优化提示词',
    'vc.prompt.optimize.hint': '输入简单主题后，可用火山方舟优化成专业级视频提示词',
    'vc.ref.title': '🖼 参考图',
    'vc.ref.subtitle': '（可选，上传后 AI 会参考此图片生成视频）',
    'vc.model.label': '视频模型：',
    'vc.duration.label': '视频时长：',
    'vc.btn.generate': '生成视频',

    'comment.title': '💬 热门评论衍生',
    'comment.subtitle': '输入热门评论，AI智能衍生出多条引流话术，帮你轻松获取更多曝光',
    'comment.input.title': '📝 粘贴或输入热门评论',
    'comment.btn.generate': '衍生评论',
    'comment.result.title': 'AI 衍生的评论',

    'reply.title': '🤖 棘手评论回复',
    'reply.subtitle': '粘贴棘手评论，AI 自动识别意图并生成高情商回复，覆盖抖音 / 小红书 / 视频号 / 微信公众号 等国内平台调性',
    'reply.platform.title': '📱 选择平台调性',
    'reply.input.title': '📝 粘贴棘手评论',
    'reply.btn.generate': '生成回复',

    'accounts.title': '账号管理',
    'accounts.subtitle': '绑定你的多平台社媒账号，一站式管理数据、回复评论',
    'accounts.btn.add': '添加账号',
    'accounts.empty.title': '还没有绑定任何账号',
    'accounts.empty.hint': '点击「添加账号」绑定你的抖音 / 小红书 / 快手 / 视频号 / 微信公众号 / 今日头条 / B站 账号',

    'assets.title': '📂 自媒体资产',
    'assets.subtitle': '管理你生成的所有内容，按类别快速查找、下载、删除',
    'assets.tab.all': '📋 全部',
    'assets.tab.article': '📝 图文文章',
    'assets.tab.image': '🖼️ 图片',
    'assets.tab.script': '🎬 短视频脚本',
    'assets.tab.video': '🎥 短视频',
    'assets.tab.boom': '🔥 爆款拆解',
    'assets.search.placeholder': '搜索标题或内容...',
    'assets.empty.title': '暂无内容',
    'assets.empty.hint': '去生成一些内容吧～',

    'ip.title': '🌐 访客IP统计',
    'ip.subtitle': '统计哪些 IP 访问过你的系统，包含 IP 地址、访问时间、持续时长、操作系统等信息',
    'ip.btn.clear': '🗑️ 清空记录',
    'ip.hint.local': '📌 数据保存在浏览器本地存储中',

    'prompts.title': '📝 提示词配置',
    'prompts.subtitle': '集中管理平台上所有功能模块使用的提示词，支持查看、编辑、按语言/模块过滤',
    'prompts.search.placeholder': '搜索提示词...',
    'prompts.filter.module.all': '全部模块',
    'prompts.filter.lang.all': '全部语言',
    'prompts.edit.click': '点击编辑 →',

    'models.title': '🤖 大模型配置',
    'models.subtitle': '展示当前平台接入的所有大模型及其配置信息，支持查看详情和修改配置',
    'models.btn.add': '添加模型',
    'models.modal.title_add': '添加模型',
    'models.modal.title_edit': '编辑模型配置',
    'models.modal.hint': '保存后立即写回 index.html 与 server.py，并即时生效',
    'models.modal.test': '🔌 测试连接',
    'models.f.name': '模型名称',
    'models.f.provider': '厂商 / Provider',
    'models.f.type': '能力类型',
    'models.f.protocol': '协议类型',
    'models.f.modelslug': '模型 slug（API 请求里的 model 字段）',
    'models.f.status': '状态',
    'picker.setdefault': '⭐ 设为默认',
    'picker.label.hotspot': 'AI 情报模型',
    'picker.label.freeqa': '问答模型',
    'picker.label.text': '文案模型',
    'picker.label.video': '视频模型',
    'picker.label.image': '图片模型',
    'picker.label.script': '脚本模型',
    'picker.label.imageprompt': '优化用模型',

    'modal.editor.title': '编辑文章',
    'modal.editor.save': '保存全文',
    'modal.editor.copy': '复制全文',
    'modal.editor.export': '导出文件',
    'modal.editor.publish': '跳转平台后台发布',
    'modal.bind.title': '添加账号',
    'modal.bind.sub': '选择平台并完成授权绑定',
    'modal.bind.step1': '选择平台',
    'modal.bind.step2': '授权绑定',
    'modal.bind.continue': '继续',
    'modal.bind.back': '上一步',
    'modal.bind.waiting': '等待授权...',
    'modal.bind.oauth_hint': '模拟 OAuth 2.0 授权（演示用，不会真的连接到你的账号）',
    'modal.bind.auto_bind_as': '模拟绑定账号名将为'
  }
};

// 国内版只保留中文：currentLang 恒为 'zh'。
// 刻意不删散落各处的 isEn / labelEn 分支 —— 它们会稳定走中文分支，
// 逐个摘掉要动近 130 处，回归风险远大于收益。
window.currentLang = 'zh';
try { localStorage.setItem('gs_lang', 'zh'); } catch (e) {}

function t(key, fallback) {
  var dict = window.I18N.zh;
  if (dict && key in dict) return dict[key];
  return (fallback !== undefined) ? fallback : key;
}

function applyI18n(root) {
  root = root || document;
  // 1) textContent
  root.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    el.textContent = t(key, el.textContent);
  });
  // 2) placeholder
  root.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key, el.getAttribute('placeholder') || ''));
  });
  // 3) title 属性
  root.querySelectorAll('[data-i18n-title]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-title');
    el.setAttribute('title', t(key, el.getAttribute('title') || ''));
  });
  // 4) document.title
  var appTitle = t('app.title', '');
  if (appTitle) document.title = appTitle;
  // 5) <html lang>
  document.documentElement.setAttribute('lang', 'zh-CN');
  // 6) 热点搜索框 placeholder 会根据当前 source 变化，需要单独刷
  var searchInput = document.getElementById('searchInput');
  if (searchInput && typeof currentSearchSource !== 'undefined') {
    var key = 'hotspot.search.placeholder.' + currentSearchSource;
    searchInput.setAttribute('placeholder', t(key, searchInput.placeholder));
  }
}

// 国内版单语：保留这两个函数只为兼容可能的历史调用点，调用后无副作用。
function setLang(lang) { window.currentLang = 'zh'; applyI18n(); }
function toggleLang() { /* 单语版本无切换 */ }

// DOM 就绪后自动 apply（保底：也在 window load 里再调一次，防止某些 nav 后加载的元素漏刷）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { applyI18n(); });
} else {
  setTimeout(function() { applyI18n(); }, 0);
}
window.addEventListener('load', function() { applyI18n(); });

// ============ DATA STORE ============
// 国内自媒体平台矩阵：图文/种草/长文类
const platformNames = { xiaohongshu: '小红书', wechat: '微信公众号', toutiao: '今日头条', zhihu: '知乎', weibo: '微博' };
// 图文类平台创作后台入口（跳转由用户自行登录发布 —— 国内平台均无开放的一键直发接口）
const platformPublishUrls = {
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish',
  wechat: 'https://mp.weixin.qq.com/',
  toutiao: 'https://mp.toutiao.com/profile_v4/graphic/publish',
  zhihu: 'https://zhuanlan.zhihu.com/write',
  weibo: 'https://weibo.com/'
};
// 视频类平台创作后台入口（跳转由用户自行登录上传）
const videoPublishUrls = {
  douyin: 'https://creator.douyin.com/creator-micro/content/upload',
  kuaishou: 'https://cp.kuaishou.com/article/publish/video',
  shipinhao: 'https://channels.weixin.qq.com/platform/post/create',
  xiaohongshu: 'https://creator.xiaohongshu.com/publish/publish',
  bilibili: 'https://member.bilibili.com/platform/upload/video/frame'
};
// 视频平台展示名映射
const videoPlatformNames = { douyin: '抖音', kuaishou: '快手', shipinhao: '微信视频号', xiaohongshu: '小红书', bilibili: 'B站' };

// 初始模拟热点数据（国内电商 / 国内自媒体方向）
// 这些是**首屏占位**，用户一进页面就有东西看；点「全网刷新」或搜索后会被真实数据顶掉。
// 刻意都写成"有运营抓手"的样子（说清该怎么做），而不是空泛的行业口号 ——
// 占位数据也是产品调性的一部分，用户会照着它理解这个模块该产出什么。
let allHotspots = [
  { id: 1, cat: 'ai', title: 'AI 生成短视频在抖音、视频号大规模铺开：一人一天出 20 条', summary: '可灵、即梦、Vidu 陆续放开长时长与多镜头能力，AI 短视频制作门槛降到历史最低。品牌方开始用「AI 出素材 + 真人剪辑校准」的组合跑账号矩阵，单人日产能从 3 条拉到 20 条。运营抓手：先用 AI 批量试钩子，跑出数据的那条再上真人重拍。', hotness: 98.5, source: '36氪', sourceUrl: '#', date: '2 小时前' },
  { id: 2, cat: 'platform', title: '小红书调整笔记推流：真实体验权重上调，硬广话术降权', summary: '小红书对笔记质量分做了调整，带有个人真实使用过程、具体场景细节的笔记曝光提升明显，而通篇卖点堆砌、绝对化用词的笔记流量下滑。运营抓手：把「产品参数」改写成「我用了两周的变化」，并在正文里落具体型号、价格带和使用场景。', hotness: 87.3, source: '新榜', sourceUrl: '#', date: '4 小时前' },
  { id: 3, cat: 'trend', title: '智能猫砂盆在抖音商城成宠物类目爆品：开箱视频撑起转化', summary: '自动铲屏的智能猫砂盆成为抖音商城宠物类目的黑马，开箱与除臭实测视频是主要转化来源，客单价集中在 800-1800 元。运营抓手：视频前 3 秒直接给「铲屎前 vs 铲屎后」的对比画面，评论区提前埋滤芯成本的答疑。', hotness: 92.1, source: '飞瓜数据', sourceUrl: '#', date: '6 小时前' },
  { id: 4, cat: 'platform', title: '视频号小店打通企业微信与社群：私域复购成为核心指标', summary: '微信生态进一步打通视频号小店、公众号与企业微信，成交后可直接把用户沉到社群里做二次触达，复购率明显高于纯公域打法。运营抓手：直播间的引导话术从「点购物车」改成「加企微领装机指导」，把一次成交变成长期私域资产。', hotness: 76.8, source: '亿邦动力', sourceUrl: '#', date: '8 小时前' },
  { id: 5, cat: 'short-video', title: '快手电商加码产业带白牌：信任电商的转化逻辑和抖音不一样', summary: '快手把资源倾斜给产业带工厂号，主播「敢报价、敢现场对比」的内容转化最好，退货率也低于同价格带的抖音链接。运营抓手：不要把抖音的爆款视频直接搬过去，快手要重拍成「工厂实拍 + 老铁口播报价」的版本。', hotness: 85.2, source: '亿邦动力', sourceUrl: '#', date: '10 小时前' },
  { id: 6, cat: 'trend', title: '2026 国内内容电商白皮书：兴趣电商增速仍高于货架电商', summary: '第三方研究机构给出的数据显示，抖音、快手、小红书为代表的兴趣电商增速继续跑在淘系、京东之上，但获客成本同步上行，投产比开始分化。运营抓手：把预算按「内容测品 30% / 稳定投流 50% / 私域承接 20%」重新切分，别把钱全押在单一投流渠道。', hotness: 91.7, source: '艾瑞咨询', sourceUrl: '#', date: '12 小时前' },
  { id: 7, cat: 'content', title: '拆了 50 条百万赞短视频：钩子 + 痛点 + 反差 + 引导 是最稳的结构', summary: '对近半年 50 条百万赞带货视频做结构拆解，完播率高的普遍在前 3 秒给出反差画面或直接抛结论，中段用一个具体数字建立可信度，结尾只给一个动作。运营抓手：把脚本的前 3 秒单独拿出来 A/B，别改整条。', hotness: 79.4, source: '人人都是产品经理', sourceUrl: '#', date: '14 小时前' },
  { id: 8, cat: 'monetize', title: '账号矩阵实操：3 人小团队跑 8 个号，月 GMV 过百万', summary: '多位国内操盘手分享同一套做法：用 AI 批量产选题与初稿，人只做最后的调性校准和投流判断，一个 3 人团队可同时运营抖音、小红书、视频号共 8 个账号。运营抓手：矩阵不是复制同一条内容，而是同一个卖点按各平台调性重写。', hotness: 88.6, source: '创业邦', sourceUrl: '#', date: '16 小时前' }
];

// 全网搜索/资讯聚合都失败时的离线兜底池（国内方向）
const webHotspotPool = [
  { id: 101, cat: 'ai', title: '可灵新版本实测：多镜头一致性提升，带货素材能直接用了', summary: '新版在人物与商品的跨镜头一致性上提升明显，此前"同一个包每个镜头长得不一样"的问题基本解决，带货素材的可用率从三成升到七成左右。', hotness: 94.3, source: '量子位', sourceUrl: '#', date: '3 小时前' },
  { id: 102, cat: 'content', title: '标题党失效：2026 真正能跑量的 5 个中文标题公式', summary: '基于十万条内容的 A/B 数据，传统夸张标题点击率下滑明显，取而代之的是"具体数字 + 具体场景 + 一个反差"的写法。', hotness: 72.1, source: '新榜', sourceUrl: '#', date: '5 小时前' },
  { id: 103, cat: 'short-video', title: '短视频脚本的 7 种通用结构（附各平台适配差异）', summary: '梳理当下最能跑的 7 种脚本结构，含"3 秒钩子 + 痛点 + 解法 + 引导"这条最稳的公式，并标出抖音、快手、小红书、B站的适配差异。', hotness: 81.5, source: '人人都是产品经理', sourceUrl: '#', date: '7 小时前' },
  { id: 104, cat: 'monetize', title: '抖音精选联盟规则调整：达人带货门槛与佣金结算变化', summary: '平台对达人带货的准入与结算规则做了调整，中小达人的合作门槛下降，但对商品口碑分的要求同步提高。', hotness: 74.9, source: '抖音电商', sourceUrl: '#', date: '9 小时前' },
  { id: 105, cat: 'ai', title: '国产大模型长文本能力对比：写长文与拆解爆款谁更稳', summary: '横向实测豆包、通义、DeepSeek、GLM 在长文写作与内容拆解上的表现差异，给出按任务选模型的建议。', hotness: 89.7, source: '机器之心', sourceUrl: '#', date: '1 小时前' },
  { id: 106, cat: 'platform', title: '今日头条上线创作辅助：自动出标题与摘要，完读率是关键变量', summary: '头条为创作者提供标题与摘要的自动生成能力，但推荐仍以前三段的完读表现为主要判据，标题只决定第一次点击。', hotness: 77.2, source: '今日头条', sourceUrl: '#', date: '11 小时前' },
  { id: 107, cat: 'trend', title: '2026 内容营销投放报告：品牌把四成以上预算投向内容而非硬广', summary: '调研显示多数品牌把内容（达人 + 自营账号）的预算占比提到四成以上，硬广位的预算份额继续被压缩。', hotness: 83.4, source: '艾瑞咨询', sourceUrl: '#', date: '13 小时前' },
  { id: 108, cat: 'short-video', title: '视频号日活与创作者分成同步走高：一二线中年人群是主力', summary: '微信侧披露的数据显示视频号播放与创作者收益同步上行，用户年龄结构比抖音更宽，一二线中年人群占比明显更高。', hotness: 90.8, source: '微信派', sourceUrl: '#', date: '2 小时前' },
  { id: 109, cat: 'content', title: '搜索还重要吗：知乎与百家号的长尾流量到底值不值得做', summary: '拆解搜索端内容的长尾价值：单篇曝光低但周期长，适合做品类科普与口碑占位，和推荐流是两套完全不同的做法。', hotness: 69.3, source: '虎嗅', sourceUrl: '#', date: '15 小时前' },
  { id: 110, cat: 'monetize', title: '知识付费 2.0：AI 把课程制作成本压到原来的一成', summary: 'AI 配音、自动剪辑与智能课件让原本 5 人团队的课程制作变成一个人能干完，知识类账号的变现门槛显著下降。', hotness: 86.1, source: '36氪', sourceUrl: '#', date: '6 小时前' },
  { id: 111, cat: 'ai', title: 'AI 出图做电商主图实测：什么能用、什么一眼假', summary: '实测 AI 生成的电商主图在服饰与家居场景可用度较高，但手部、文字与商品细节仍是硬伤，需要人工二次修。', hotness: 93.6, source: '量子位', sourceUrl: '#', date: '4 小时前' },
  { id: 112, cat: 'platform', title: '抖音推荐机制调整：完播权重下调，评论质量权重上调', summary: '平台对推荐权重做了调整，单纯拉完播的短平快内容红利收窄，能引发有效讨论的内容获得更多二次推流。', hotness: 82.7, source: '抖音电商', sourceUrl: '#', date: '8 小时前' }
];

let selectedPlatform = 'xiaohongshu';
let generatedArticles = [];
let currentArticle = null;
let selectedVideoPlatform = 'douyin';
let currentCategory = 'all';
let nextWebId = 200;
let currentSection = 'hotspot';
let lastSearchQuery = '';
let currentSearchResults = [];
let isHotspotSearchMode = false;
// 'cn'   = 全网搜索：先真抓 Bing/百度 拿到可点开的真链接，再交模型结构化
// 'news'  = 资讯聚合：模型先出 10 条热点情报，抓取腿只用来补真链接
// （'news' 这个键早期叫 'overseas'，旧快照里可能还存着老值 —— 恢复时会映射过来）
let currentSearchSource = 'news';  // 'cn' | 'news'

// ============ MiniMax API Configuration ============
// ⚠️ 前端的 5 个 API key 一律留空，密钥只存在服务端（server.py / systemd EnvironmentFile）。
// 原因：index.html 是首页，必须允许下载，写在这里的密钥会随页面发到每一个访客的浏览器，
// 按 F12 或 curl 首页就能抄走 —— 那是每次访问都泄露一次，不是"可能被利用"。
// 清空是安全的：USE_PROXY 为真（任何 http 访问）时，请求都发给自己的后端 /api/*，
// 后端 build_headers() 会用服务端密钥重新构造请求头，浏览器带来的这个本来就被丢掉。
// 实测：用伪造 key 和完全不带 key 打 /api/ark_text，都返回 200 正常结果。
// 变量和引用全部保留，只是值为空 —— 便于本地调试时临时填值，也不动任何调用逻辑。
var MM_API_KEY = '';
var USE_PROXY = (window.location.protocol !== 'file:');  // 非本地文件打开时始终走代理（安全 + 避免CORS）
var MM_TEXT_URL = USE_PROXY ? '/api/text' : 'https://api.minimaxi.com/anthropic/v1/messages';
var MM_IMAGE_URL = USE_PROXY ? '/api/image' : 'https://api.minimaxi.com/v1/image_generation';
var MM_VIDEO_URL = USE_PROXY ? '/api/video' : 'https://api.minimaxi.com/v1/video_generation';
var MM_VIDEO_QUERY_URL = USE_PROXY ? '/api/video_query' : 'https://api.minimaxi.com/v1/query/video_generation';
var HY_IMAGE_URL = USE_PROXY ? '/api/hy_image' : 'https://tokenhub.tencentmaas.com/v1/api/image/generate';

// ============ 腾讯混元 HunyuanVideo API Configuration ============
var HY_API_KEY = '';
var HY_SUBMIT_URL = USE_PROXY ? '/api/hy_video_submit' : 'https://tokenhub.tencentmaas.com/v1/api/video/submit';
var HY_QUERY_URL  = USE_PROXY ? '/api/hy_video_query'  : 'https://tokenhub.tencentmaas.com/v1/api/video/query';
var selectedVideoModel = 'seedance-mini';  // 'seedance-mini' / 'agnes' / 'hunyuan' / 'minimax'，默认 Seedance 2 Mini
var vcSelectedModel = 'seedance-mini';     // 视频创作页独立选择，与上面保持同步

// ============ Seedance 2 Mini API Configuration (AggregateAPI) ============
var SEEDANCE_MINI_API_KEY = '';
var SEEDANCE_MINI_API_URL = USE_PROXY ? '/api/seedance_mini' : 'https://aaapi.togomol.com/api/v1/tasks';
var SEEDANCE_MINI_PROVIDER_SLUG = 'kie-oai';  // 轮询状态时的 providerSlug（实测 'kie' 会返回 provider_not_found）
var SEEDANCE_MINI_MODEL = 'bytedance/seedance-2-mini';  // Seedance 2 Mini 模型ID

// ============ Agnes AI API Configuration (图像+视频生成) ============
var AGNES_API_KEY = '';
var AGNES_IMAGE_URL = USE_PROXY ? '/api/agnes_image' : 'https://apihub.agnes-ai.com/v1/images/generations';
var AGNES_VIDEO_SUBMIT_URL = USE_PROXY ? '/api/agnes_video_submit' : 'https://apihub.agnes-ai.com/v1/videos';
// Agnes Video 2.5：同一个 /v1/videos 端点，只有 model 值不同。代理侧仍走独立两条路由，
// 这样在「大模型配置」里改 2.5 的 baseUrl 不会连带把 V2.0 一起改掉。
var AGNES_V25_SUBMIT_URL = USE_PROXY ? '/api/agnes_video25_submit' : 'https://apihub.agnes-ai.com/v1/videos';
var AGNES_V25_QUERY_URL = USE_PROXY ? '/api/agnes_video25_query' : 'https://apihub.agnes-ai.com/v1/videos';
var AGNES_VIDEO_QUERY_URL = USE_PROXY ? '/api/agnes_video_query' : 'https://apihub.agnes-ai.com/v1/videos';

// ============ 火山方舟 API Configuration (文案生成专用) ============
var ARK_API_KEY = '';
var ARK_TEXT_URL = USE_PROXY ? '/api/ark_text' : 'https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions';
// Agent Plan 文本端点：当前**唯一可用**的文本链路。
// 上面那条 coding/v3 实测 400 InvalidSubscription（CodingPlan 订阅过期），
// MiniMax 实测 429（Token Plan 用量上限）—— 两条老链路都挂了。
// 这条另用一把 key（服务端 ARK_PLAN_API_KEY），模型名必须 ark-code-latest。
// 实测支持：文本、图片理解（content 传数组）、SSE 流式。
var ARK_PLAN_TEXT_URL = USE_PROXY ? '/api/ark_plan_text' : 'https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions';
// 文生图：与文本同一个 ARK key。加这条是因为原三家图片模型同时失效（MiniMax 额度耗尽 /
// Agnes 超时 / 混元端点 404），Seedream 是目前唯一实测能出图的。
var ARK_IMAGE_URL = USE_PROXY ? '/api/ark_image' : 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
// 这里原来有个全局 var selectedTextModel = 'ark'（'ark' | 'minimax'）。已删除 ——
// 文本模型现在一律由各页面自己的模型下拉框决定，见 callModuleText 上方的注释。

// 背景音乐库（免费无版权音频）
var bgmTracks = [
  { id: 'none',  label: '🔇 无声', url: '' },
  { id: 'tech',  label: '🤖 科技感', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'light', label: '🎵 轻快活力', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'calm',  label: '🌿 舒缓', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' }
];
var currentBgmId = 'none';
var currentBgmAudio = null;

// 调用 MiniMax 文本生成 API（Anthropic 兼容端点）
async function callMiniMaxText(systemPrompt, userPrompt) {
  var maxAttempts = 4;
  var lastErr = null;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      var response = await fetch(MM_TEXT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': MM_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'MiniMax-M2.7',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });

      if (response.ok) {
        var data = await response.json();
        var text = '';
        if (data.content && Array.isArray(data.content)) {
          for (var i = 0; i < data.content.length; i++) {
            if (data.content[i].type === 'text') text += data.content[i].text;
          }
        }
        if (!text && data.error) throw new Error(data.error.message || 'API error');
        return text || '';
      }

      var status = response.status;
      var retryable = (status === 429 || status === 500 || status === 502 || status === 503 || status === 504);
      lastErr = new Error('API HTTP ' + status);
      lastErr.status = status;
      lastErr.isRateLimit = (status === 429);
      if (!retryable) throw lastErr;

      if (attempt < maxAttempts) {
        var retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
        var backoffMs = retryAfter > 0
          ? Math.min(retryAfter * 1000, 30000)
          : Math.min(800 * Math.pow(2, attempt - 1), 8000) + Math.floor(Math.random() * 400);
        console.warn('[MiniMax] ' + status + ' (attempt ' + attempt + '/' + maxAttempts + '), retrying in ' + backoffMs + 'ms');
        await new Promise(function(r) { setTimeout(r, backoffMs); });
      }
    } catch (fetchErr) {
      if (fetchErr && fetchErr.status) throw fetchErr;
      lastErr = fetchErr;
      if (attempt < maxAttempts) {
        var waitMs = Math.min(800 * Math.pow(2, attempt - 1), 8000);
        await new Promise(function(r) { setTimeout(r, waitMs); });
      }
    }
  }
  var exhausted = lastErr || new Error('MiniMax API failed after retries');
  if (exhausted.status === 429) exhausted.isRateLimit = true;
  throw exhausted;
}

// 调用火山方舟文本生成 API
// 调用火山方舟文本生成 API（带 429/5xx 指数退避重试 + Retry-After 尊重）
// 内部实现收在 _callArkChat：把「端点 + messages 数组」参数化，好让
//   · callArkText / callArkPlanText 两条端点共用同一套重试逻辑（原来是复制粘贴的隐患）
//   · 自由问答的 callModuleChat 能直接传多轮历史和多模态 content 数组
async function callArkText(systemPrompt, userPrompt) {
  return _callArkChat(ARK_TEXT_URL, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);
}

// Agent Plan 端点（当前唯一可用的文本链路，详见 ARK_PLAN_TEXT_URL 注释）
async function callArkPlanText(systemPrompt, userPrompt) {
  return _callArkChat(ARK_PLAN_TEXT_URL, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);
}

// messages 直接照 OpenAI 格式传；content 可以是字符串，也可以是
// [{type:'text',...},{type:'image_url',...}] 多模态数组（Agent Plan 端点实测支持）。
async function _callArkChat(endpointUrl, messages, opts) {
  opts = opts || {};
  var maxAttempts = 4;
  var lastErr = null;
  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      var response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ARK_API_KEY
        },
        body: JSON.stringify({
          model: 'ark-code-latest',
          max_tokens: opts.maxTokens || 4000,
          temperature: (opts.temperature != null ? opts.temperature : 0.7),
          messages: messages
        })
      });

      if (response.ok) {
        var data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return data.choices[0].message.content || '';
        }
        if (data.error) throw new Error(data.error.message || 'API error');
        return '';
      }

      // 非 2xx：读取 body 提取可读错误
      var status = response.status;
      var errMsg = 'Ark API HTTP ' + status;
      var retryable = (status === 429 || status === 500 || status === 502 || status === 503 || status === 504);
      var bodyText = '';
      try { bodyText = await response.text(); } catch (e) {}
      if (bodyText) {
        try {
          var ej = JSON.parse(bodyText);
          var m = (ej.error && (ej.error.message || ej.error.code)) || ej.message || '';
          if (m) errMsg = 'Ark ' + status + ': ' + m;
        } catch (e2) {
          var snip = bodyText.replace(/\s+/g, ' ').trim().slice(0, 160);
          if (snip) errMsg = 'Ark ' + status + ': ' + snip;
        }
      }
      lastErr = new Error(errMsg);
      lastErr.status = status;
      lastErr.isRateLimit = (status === 429);

      if (!retryable) throw lastErr;  // 4xx（除429）/其他 → 立即失败

      // 计算退避：优先 Retry-After，否则指数退避 + 抖动
      if (attempt < maxAttempts) {
        var retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
        var backoffMs = retryAfter > 0
          ? Math.min(retryAfter * 1000, 30000)
          : Math.min(800 * Math.pow(2, attempt - 1), 8000) + Math.floor(Math.random() * 400);
        console.warn('[Ark] ' + status + ' (attempt ' + attempt + '/' + maxAttempts + '), retrying in ' + backoffMs + 'ms');
        await new Promise(function(r) { setTimeout(r, backoffMs); });
      }
    } catch (fetchErr) {
      // 网络层错误（fetch reject）也按可重试处理
      if (fetchErr && fetchErr.status) throw fetchErr;  // 已是构造的业务错误
      lastErr = fetchErr;
      if (attempt < maxAttempts) {
        var waitMs = Math.min(800 * Math.pow(2, attempt - 1), 8000);
        console.warn('[Ark] network err (attempt ' + attempt + '/' + maxAttempts + '), retrying in ' + waitMs + 'ms:', fetchErr && fetchErr.message);
        await new Promise(function(r) { setTimeout(r, waitMs); });
      }
    }
  }
  // 重试耗尽
  var exhausted = lastErr || new Error('Ark API failed after retries');
  if (!exhausted.isRateLimit && exhausted.status === 429) exhausted.isRateLimit = true;
  throw exhausted;
}

// ============ 文本模型调用 ============
// 这里原先有一对 callTextWithFallback / callSelectedText：把「火山方舟」和「MiniMax」
// 硬编码成一组主备，主的失败就静默换另一家继续生成，主备谁在前由全局 selectedTextModel 决定。
// 两者已删除，因为这套逻辑有三个各自独立的毛病：
//   1. 它无视页面上的模型下拉框 —— selectedTextModel 只被「图文生成」页的 chip 改过，
//      视频页怎么选都影响不到它。用户在视频页选了 Agnes，点「生成完整成片」却弹
//      "火山方舟暂不可用，已自动切换 MiniMax" —— 提示里的两个名字他一个都没选过。
//   2. 它只认这两家。用户自己加的模型、以及 ark-plan-text 这条唯一在用的链路，都进不去。
//   3. 静默换厂商会让产出的署名失真：文章末尾会盖一行"本文由 X 生成"，X 取自
//      用户选的模型，而正文其实是另一家写的。
// 现在文本一律走 callModuleText(moduleKey, ...)：按下拉框选中的模型调，选中的失败就
// 报错说清是哪个模型、什么原因，不替用户换厂商。要换请他自己在下拉框里换 —— 生成
// 结果是要发出去的，用哪家不该由程序背着他决定。

// =============================================================
//  中文文案规范化：去围栏 + 段落
//  刻意不再做"双引号 → 单引号"：中文正文里的「」和""是正常标点，
//  英文版那条规则会把它们全部替换掉，读起来像坏了。
// =============================================================
// 生成结果的排版清洗。跟语言无关：去掉 markdown 围栏、压掉多余空行、
// 把"整段一坨"按句末标点重新分段（句末标点集合中英文都覆盖）。
// 原名 normalizeEnglishCopy 是海外版遗留 —— 它从来没做过任何英文特有处理。
function normalizeCopyText(txt) {
  var s = String(txt || '');
  // 去掉 markdown 代码围栏
  s = s.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/g, '');
  // 压缩超过 2 个连续空行为 2 个（保留段落间距）
  s = s.replace(/\n{3,}/g, '\n\n');
  // 处理"整段一坨"：若整段没有一次空行且长度较大，按句末标点分段（含中文句号/问号/叹号）
  if (s.length > 400 && s.indexOf('\n\n') === -1) {
    var sentences = s.split(/(?<=[。！？.!?])\s*/);
    var buf = [], cur = '';
    for (var i = 0; i < sentences.length; i++) {
      cur += (cur ? ' ' : '') + sentences[i];
      if ((i + 1) % 3 === 0 || i === sentences.length - 1) {
        buf.push(cur.trim());
        cur = '';
      }
    }
    if (cur.trim()) buf.push(cur.trim());
    s = buf.join('\n\n');
  }
  return s.trim();
}
// 把纯文本转成带段落的 HTML（<p> 用作 tsOutput 分段视觉）
function textToParagraphsHtml(txt) {
  var s = normalizeCopyText(txt);
  var parts = s.split(/\n{2,}/);
  return parts.map(function(p) {
    return '<p>' + escapeHtml(p).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

// =============================================================
//  富文本排版：颜色标记 → 内联样式 HTML
// =============================================================
// 为什么让模型输出自定义标记（[key]…[/key]）而不是直接让它写 HTML style：
//   1. 安全 —— 模型碰不到 style 属性和标签名，颜色字符串全部在下面写死；
//      标记之间的正文在各自调用点已经过 escapeHtml，不多开注入面。
//   2. 一致 —— 全站同一套配色。让模型自己挑色，这篇天蓝下篇宝蓝，还会挑出
//      在深色界面上根本看不见的浅黄。
//   3. 粘得出去 —— 公众号、小红书、头条的后台粘贴时会剥掉 <style> 和 class，
//      只认**内联** style。所以这里生成的是写死十六进制的 style="color:#3b82f6"，
//      不是 var(--accent) 也不是 class —— 用 CSS 变量的话站内好看，粘到公众号全变黑字。
//
// 配色按 WCAG 对比度实算过（见下表）：4 个行内色在本站深底和公众号白底
// 两种环境下对比度都 ≥3.0；3 个块级标记自带浅底色配深字，自身对比度 ≥6.3，
// 所以深色/浅色环境都读得清，不需要为两种底色各出一套色板。
//
// 站内底色从 #0f172a 压深到 #020617 后重算过一遍，4 个行内色的深底对比度
// 全部上升（4.85→5.48 等），白底一列不受影响 —— 视觉改版没有削弱可读性。
// 这 7 个色**不参与主题化**：它们必须是写死的内联十六进制，理由见上面第 3 条。
//
//   标记      用途              颜色      深底   白底
//   [key]     核心概念/主题词    #3b82f6   5.48   3.68
//   [num]     数字/价格/时间     #ea580c   5.67   3.56
//   [good]    优点/正向结论      #16a34a   6.12   3.30
//   [warn]    注意/避坑/风险     #e8453c   5.14   3.93
//   [hl]      高亮金句（黄底）    #7c2d12 on #fff3cd  8.46
//   [tip]     提示框（蓝底块）    #1e3a5f on #eff6ff  10.57
//   [quote]   金句/引言（紫底块） #4c1d95 on #faf5ff  10.21
var RICH_INLINE_STYLES = {
  key:  'color:#3b82f6;font-weight:700;',
  num:  'color:#ea580c;font-weight:700;',
  good: 'color:#16a34a;font-weight:600;',
  warn: 'color:#e8453c;font-weight:600;',
  hl:   'background:#fff3cd;color:#7c2d12;font-weight:600;padding:1px 5px;border-radius:3px;'
};
var RICH_BLOCK_STYLES = {
  tip:   'background:#eff6ff;color:#1e3a5f;border-left:4px solid #3b82f6;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;line-height:1.8;',
  quote: 'background:#faf5ff;color:#4c1d95;border-left:4px solid #8b5cf6;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0;line-height:1.8;font-style:normal;'
};

// 传进来的 s 必须**已经是可直接插入的 HTML**：
//   · 图文生成 —— 模型本来就输出 HTML，原样传
//   · 文案创作 —— 先 escapeHtml 再传
// 本函数只认标记、只吐写死的 style，不改动其余任何字符。
function richMarkupToHtml(s) {
  var out = String(s == null ? '' : s);

  // 块级先转：它们产出 <div>，必须在行内标记之前处理，否则 [tip] 里的
  // [key] 会先被包成 span、再被块级正则的 [\s\S]*? 吞掉边界。
  Object.keys(RICH_BLOCK_STYLES).forEach(function(tag) {
    var re = new RegExp('\\[' + tag + '\\]([\\s\\S]*?)\\[\\/' + tag + '\\]', 'g');
    out = out.replace(re, function(_m, inner) {
      // 块级标记常被模型放在 <p> 里，于是形成 <p><div>…</div></p>。
      // 这在 HTML 里是非法嵌套，浏览器会把 p 提前闭合 —— 视觉上没问题，
      // 但会多出一个空 <p>。所以这里主动把紧邻的空段落收掉。
      return '<div style="' + RICH_BLOCK_STYLES[tag] + '">' + inner.trim() + '</div>';
    });
  });

  Object.keys(RICH_INLINE_STYLES).forEach(function(tag) {
    var re = new RegExp('\\[' + tag + '\\]([\\s\\S]*?)\\[\\/' + tag + '\\]', 'g');
    out = out.replace(re, function(_m, inner) {
      return '<span style="' + RICH_INLINE_STYLES[tag] + '">' + inner + '</span>';
    });
  });

  // 收尾：模型偶尔会漏掉闭合标记，剩下一个孤零零的 [key] 挂在正文里。
  // 宁可把它抹掉也不能让用户看见 —— 用户不知道那是什么，只会觉得输出坏了。
  out = out.replace(/\[\/?(?:key|num|good|warn|hl|tip|quote)\]/g, '');
  // <p><div> 非法嵌套留下的空段落
  out = out.replace(/<p>\s*(<div style="(?:background:#eff6ff|background:#faf5ff))/g, '$1')
           .replace(/(<\/div>)\s*<\/p>/g, '$1');
  return out;
}

// 给模型的排版规范。两个模块共用一份 —— 分开写必然漂移，
// 到时候「图文生成」有颜色而「文案创作」没有，用户会当成 Bug。
// 刻意写了"不要每句都标"：模型的默认倾向是把整段都染上色，
// 那样等于没有重点，比纯黑字更难读。
function richFormatRules() {
  return '\n\n【彩色排版标记】用下面这套标记给关键内容上色，让文案有专业排版的视觉层次：\n'
    + '- [key]核心概念或主题词[/key] —— 蓝色加粗，全文 3-6 处，只标真正的关键词\n'
    + '- [num]数字、价格、时长、比例[/num] —— 橙色加粗，例如 [num]¥299[/num]、[num]3 天[/num]、[num]85%[/num]\n'
    + '- [good]优点、正向结论、推荐理由[/good] —— 绿色\n'
    + '- [warn]注意事项、避坑提醒、风险[/warn] —— 红色\n'
    + '- [hl]最想让人记住的那一句[/hl] —— 黄色高亮底，全文最多 2 处\n'
    + '- [tip]单独成块的提示或小贴士[/tip] —— 蓝底提示框，独占一段\n'
    + '- [quote]金句、用户原话、引言[/quote] —— 紫底引用块，独占一段\n'
    + '标记规则（很重要）：\n'
    + '- **不要每句话都标**。通篇上色等于没有重点，比纯黑字更难读。一段里最多标 1-2 处。\n'
    + '- 标记必须成对闭合，不要嵌套（[key]里不要再放[num]）。\n'
    + '- 标记里只放文字，不要放标点开头结尾，不要跨段落。\n'
    + '- 除这 7 个标记外不要写任何 HTML 标签或 CSS 颜色，颜色由系统统一渲染。';
}

// 编辑器工具栏：给选中文字套/去上色。
// 不用 document.execCommand('foreColor')：它产出 <font color> 这种被废弃的标签，
// 而且没法一次带上 font-weight 和高亮底色；这里直接包一个和 richMarkupToHtml
// 完全同款的 <span style>，保证手动标的和 AI 标的在粘贴到公众号后长得一样。
// tag 传空字符串 = 清除上色。
function editorApplyRich(tag) {
  var host = document.getElementById('editorContent');
  var sel = window.getSelection();
  if (!host || !sel || !sel.rangeCount) { showToast('请先选中要上色的文字'); return; }
  var range = sel.getRangeAt(0);
  // 选区必须落在编辑器内，否则会去改页面上别的地方
  if (!host.contains(range.commonAncestorContainer)) { showToast('请先在编辑器里选中文字'); return; }
  if (range.collapsed) { showToast('请先选中要上色的文字'); return; }

  if (!tag) {
    // 清除：把和选区相交的上色 span 整个拆掉。
    // 不用 cloneContents 做片段手术 —— 用户最常见的操作是双击选中已上色的词，
    // 这时选区落在 span **内部**，span 是祖先而不是片段成员，克隆出来的碎片里
    // 一个 span 都没有，"清除"会静默失效（实测过）。
    // 改成正向遍历：谁与选区相交就 unwrap 谁，祖先和子孙一并覆盖。
    // 只认 span[style]，不动 strong/em —— 用户点的是"清除上色"不是"清除全部格式"。
    var targets = [];
    var anc = range.commonAncestorContainer;
    if (anc.nodeType === 3) anc = anc.parentNode;
    for (var p = anc; p && p !== host; p = p.parentNode) {
      if (p.nodeType === 1 && p.tagName === 'SPAN' && p.getAttribute('style')) targets.push(p);
    }
    Array.prototype.forEach.call(host.querySelectorAll('span[style]'), function(sp) {
      if (range.intersectsNode(sp) && targets.indexOf(sp) === -1) targets.push(sp);
    });
    if (!targets.length) { showToast('选中的文字没有上色'); return; }
    targets.forEach(function(sp) {
      if (!sp.parentNode) return;
      while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
      sp.parentNode.removeChild(sp);
    });
    host.normalize();   // 合并 unwrap 后留下的相邻文本节点，避免越点越碎
    sel.removeAllRanges();
    return;
  }

  var style = RICH_INLINE_STYLES[tag];
  if (!style) return;
  var span = document.createElement('span');
  span.setAttribute('style', style);
  try {
    // surroundContents 在选区跨标签边界时会抛 InvalidStateError，
    // 这时退回 extract+append —— 结果一样，只是内部标签结构可能被重组。
    range.surroundContents(span);
  } catch (e) {
    span.appendChild(range.extractContents());
    range.insertNode(span);
  }
  sel.removeAllRanges();
}

// =============================================================
//  通用模型分发器 + 各模块模型下拉框系统
// =============================================================

// 通过自定义代理调用任意 OpenAI/Anthropic 兼容文本模型。
// 单轮入口：转成 messages 数组后交给 _callCustomChatModel —— 这样多轮 + 多模态
// （自由问答）和单轮（其余六个文本模块）共用同一条请求代码，不必维护两份。
async function _callCustomTextModel(cfg, systemPrompt, userPrompt) {
  return _callCustomChatModel(cfg, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]);
}

// messages 为 OpenAI 格式数组；单条 content 可以是字符串，也可以是多模态数组
// [{type:'text'},{type:'image_url'}]。
// Anthropic 协议的 system 是顶层字段、图片格式也不同（source.base64 而非 image_url），
// 所以走 Anthropic 时把多模态数组降级成纯文本 —— 宁可丢图也不能发一个必定 400 的包。
async function _callCustomChatModel(cfg, messages) {
  var isAnthropic = /anthropic/i.test(cfg.protocol || '');
  var sysParts = [], convo = [];
  for (var mi = 0; mi < messages.length; mi++) {
    var msg = messages[mi];
    if (msg.role === 'system') { sysParts.push(_chatContentToText(msg.content)); continue; }
    convo.push(isAnthropic ? { role: msg.role, content: _chatContentToText(msg.content) } : msg);
  }
  var systemPrompt = sysParts.join('\n\n');
  var payload = isAnthropic
    ? { model: cfg.model || 'claude-opus-4-8', max_tokens: 4000, system: systemPrompt, messages: convo }
    : { model: cfg.model || 'gpt-4o', max_tokens: 4000, temperature: 0.7,
        messages: (systemPrompt ? [{ role: 'system', content: systemPrompt }] : []).concat(convo) };

  var isProxy = (window.location.protocol !== 'file:');
  var url, headers, body;
  if (isProxy) {
    url = '/api/custom_model';
    headers = { 'Content-Type': 'application/json' };
    body = {
      url: cfg.baseUrl,
      method: 'POST',
      auth_type: isAnthropic ? 'x-api-key' : 'bearer',
      auth_key: cfg.apiKey || '',
      headers: isAnthropic ? { 'anthropic-version': '2023-06-01' } : {},
      body: payload
    };
  } else {
    url = cfg.baseUrl;
    headers = { 'Content-Type': 'application/json' };
    if (isAnthropic) { headers['x-api-key'] = cfg.apiKey || ''; headers['anthropic-version'] = '2023-06-01'; }
    else { headers['Authorization'] = 'Bearer ' + (cfg.apiKey || ''); }
    body = payload;
  }
  var resp = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    var e = new Error((cfg.name || cfg.id) + ' HTTP ' + resp.status);
    e.status = resp.status; e.isRateLimit = (resp.status === 429);
    throw e;
  }
  var data = await resp.json();
  // OpenAI 风格
  if (data.choices && data.choices[0]) {
    var msg = data.choices[0].message || data.choices[0];
    return (msg.content || data.choices[0].text || '').toString();
  }
  // Anthropic 风格
  if (data.content && Array.isArray(data.content)) {
    var txt = '';
    for (var i = 0; i < data.content.length; i++) if (data.content[i].type === 'text') txt += data.content[i].text;
    return txt;
  }
  if (data.error) { var ee = new Error(data.error.message || 'model error'); throw ee; }
  return '';
}

// 多模态 content 数组 → 纯文本。图片降级成一句占位说明，
// 免得历史里的图片消息在不支持多模态的模型上变成空字符串（那样上下文会莫名断掉）。
function _chatContentToText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content == null ? '' : content);
  var parts = [];
  for (var i = 0; i < content.length; i++) {
    var p = content[i] || {};
    if (p.type === 'text') parts.push(p.text || '');
    else if (p.type === 'image_url') parts.push('[用户上传了一张图片，但当前模型不支持图片输入]');
  }
  return parts.join('\n');
}

// 已知内置文本模型的调用器映射（复用带重试的实现）
var TEXT_MODEL_BUILTIN = {
  'ark-plan-text': function(sys, user) { return callArkPlanText(sys, user); },
  'ark-text': function(sys, user) { return callArkText(sys, user); },
  'minimax-text': function(sys, user) { return callMiniMaxText(sys, user); }
};

// 解析某个文本模型 id → 可调用函数
function resolveTextModelCall(modelId) {
  if (TEXT_MODEL_BUILTIN[modelId]) return TEXT_MODEL_BUILTIN[modelId];
  var cfg = null;
  try {
    var models = getModels();
    for (var i = 0; i < models.length; i++) if (models[i].id === modelId) { cfg = models[i]; break; }
  } catch (e) {}
  if (!cfg) return null;
  return function(sys, user) { return _callCustomTextModel(cfg, sys, user); };
}

// 取某类型的可用模型（active 且未被删除）
function getModelsByType(type) {
  var out = [];
  try {
    var models = getModels();
    for (var i = 0; i < models.length; i++) {
      if (models[i].type === type && models[i].status !== 'disabled') out.push(models[i]);
    }
  } catch (e) {}
  return out;
}

// ---- 各模块默认模型（可被"设为默认"持久化覆盖） ----
// image 默认从 agnes-image 换成 ark-image：Agnes 实测已 90s 超时，
// 而 Seedream 是当前唯一能出图的（详见 IMAGE_MODEL_PRIORITY 注释）。
// text 默认从 ark-text 换成 ark-plan-text：coding/v3 实测 400 InvalidSubscription
// （CodingPlan 订阅过期），MiniMax 实测 429（Token Plan 上限）—— 两条老链路都挂了，
// 六个文本模块此前是全线报错状态。Agent Plan 端点是当前唯一可用的。
// video-script / vc-script / image-prompt 是**文本**模块，跟同页的 video / video-create /
// image（视觉模块）并存。加它们是因为这三个页面本来就要调文本模型（分镜脚本、AI 优化提示词），
// 但页面上只有一个"视频模型 / 图片模型"下拉 —— 用户选了 Agnes 视频模型，却在点「生成完整成片」
// 时收到"火山方舟暂不可用，已自动切换 MiniMax"，完全不知道这是哪来的（用户报的 Bug）。
// 根因是那条链路读的是全局 selectedTextModel（已删），而它只被图文生成页的 chip 改过，
// 视频页无从影响。现在每个会调文本模型的页面都自己有一个可见的文本模型下拉。
var DEFAULT_MODULE_MODELS = {
  'hotspot': 'ark-plan-text', 'article': 'ark-plan-text', 'text-studio': 'ark-plan-text',
  'comment': 'ark-plan-text', 'reply': 'ark-plan-text', 'sourcing': 'ark-plan-text',
  'freeqa': 'ark-plan-text',
  'video-script': 'ark-plan-text', 'vc-script': 'ark-plan-text', 'image-prompt': 'ark-plan-text',
  'image': 'ark-image', 'video': 'seedance-mini-video', 'video-create': 'seedance-mini-video'
};
var MODULE_MODEL_TYPE = {
  'hotspot': 'text', 'article': 'text', 'text-studio': 'text', 'comment': 'text', 'reply': 'text',
  'sourcing': 'text', 'freeqa': 'text',
  'video-script': 'text', 'vc-script': 'text', 'image-prompt': 'text',
  'image': 'image', 'video': 'video', 'video-create': 'video'
};

// 每模块默认模型：缓存 + 后端持久化（bootAppData 时预载）
window._moduleDefaultsCache = null;
function _loadModuleModelOverrides() {
  return window._moduleDefaultsCache || {};
}
function getModuleModelId(moduleKey) {
  var overrides = _loadModuleModelOverrides();
  if (overrides[moduleKey]) {
    // 校验仍存在且类型匹配
    var type = MODULE_MODEL_TYPE[moduleKey];
    var avail = getModelsByType(type);
    for (var i = 0; i < avail.length; i++) if (avail[i].id === overrides[moduleKey]) return overrides[moduleKey];
  }
  var def = DEFAULT_MODULE_MODELS[moduleKey];
  if (def) {
    var avail2 = getModelsByType(MODULE_MODEL_TYPE[moduleKey]);
    for (var j = 0; j < avail2.length; j++) if (avail2[j].id === def) return def;
  }
  // 兜底：该类型第一个可用模型
  var fallback = getModelsByType(MODULE_MODEL_TYPE[moduleKey]);
  return fallback.length ? fallback[0].id : null;
}
function setModuleModelId(moduleKey, modelId, persist) {
  if (persist) {
    var overrides = _loadModuleModelOverrides();
    overrides[moduleKey] = modelId;
    window._moduleDefaultsCache = overrides;
    if (window.currentUser) {
      fetch('/api/data/module_defaults', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaults: overrides })
      }).catch(function(e) {});
    }
  }
}

// ---- 模块级文本调用：**只调下拉框里选中的那个模型** ----
// 原先这里是"选中的失败就按配置顺序遍历其它文本模型"。已去掉，理由同上面那段注释：
// 用户选了 A，程序拿 B 出的稿，而署名、资产记录、成功提示写的都是 A —— 产出是要发到
// 平台上的，用哪家模型写的不能含糊。失败就把哪个模型、什么错原样报出来，让用户自己决定
// 是重试、还是去下拉框换一个。
async function callModuleText(moduleKey, systemPrompt, userPrompt) {
  // 用 getPickedModelId（先读下拉框）而不是 getModuleModelId（只读持久化默认）——
  // 后者会让下拉框变成纯装饰：用户切了模型但不点「设为默认」，生成走的还是旧模型。
  var picked = getPickedModelId(moduleKey);
  if (!picked) throw new Error('尚未配置可用的文本大模型，请到「大模型配置」添加一个');
  var fn = resolveTextModelCall(picked);
  if (!fn) throw new Error('模型「' + (modelNameById(picked) || picked) + '」无法调用，请到「大模型配置」检查它的接口地址和协议');
  var out;
  try {
    out = await fn(systemPrompt, userPrompt);
  } catch (e) {
    console.warn('[callModuleText:' + moduleKey + '] ' + picked + ' failed:', e && e.message);
    var name = modelNameById(picked) || picked;
    var why = (e && (e.isRateLimit || e.status === 429)) ? '请求过多（429），稍等一会儿重试'
      : (e && e.message) ? e.message : '未知错误';
    var err = new Error('模型「' + name + '」调用失败：' + why + '。可稍后重试，或在上方下拉框换一个模型。');
    err.status = e && e.status;
    err.isRateLimit = e && e.isRateLimit;
    throw err;
  }
  if (!out || !out.trim()) {
    throw new Error('模型「' + (modelNameById(picked) || picked) + '」返回了空内容，请重试或换一个模型。');
  }
  return out;
}

// ---- 多轮 / 多模态版的模型解析（自由问答用）----
// 与 resolveTextModelCall 并列而不是替换它：那个的签名是 (sys, user) 两个字符串，
// 被六个模块直接调用，改签名会波及全部。这个收 messages 数组。
var CHAT_MODEL_BUILTIN = {
  // Agent Plan 端点实测支持多模态（content 传数组答对了图片颜色），是唯一能收图的
  'ark-plan-text': function(messages) { return _callArkChat(ARK_PLAN_TEXT_URL, messages); },
  'ark-text': function(messages) { return _callArkChat(ARK_TEXT_URL, messages); },
  // MiniMax 走 Anthropic 协议，system 是顶层字段、图片格式也不同 → 图片降级成占位文本
  'minimax-text': function(messages) {
    var sys = [], user = [];
    for (var i = 0; i < messages.length; i++) {
      var txt = _chatContentToText(messages[i].content);
      if (messages[i].role === 'system') sys.push(txt);
      else user.push((messages[i].role === 'assistant' ? 'AI：' : '用户：') + txt);
    }
    return callMiniMaxText(sys.join('\n\n'), user.join('\n\n'));
  }
};
function resolveChatModelCall(modelId) {
  if (CHAT_MODEL_BUILTIN[modelId]) return CHAT_MODEL_BUILTIN[modelId];
  var cfg = null;
  try {
    var models = getModels();
    for (var i = 0; i < models.length; i++) if (models[i].id === modelId) { cfg = models[i]; break; }
  } catch (e) {}
  if (!cfg) return null;
  return function(messages) { return _callCustomChatModel(cfg, messages); };
}

// 模块级多轮对话调用：与 callModuleText 同样"只调选中的那个模型"，
// 区别只是收 OpenAI 格式的 messages 数组（装得下多轮历史和图片）。
// 多轮场景下静默换厂商比单轮更糟：上一轮是 A 答的、这一轮换成 B，对话人设和口吻会突变。
async function callModuleChat(moduleKey, messages) {
  var picked = getPickedModelId(moduleKey);
  if (!picked) throw new Error('尚未配置可用的文本大模型，请到「大模型配置」添加一个');
  var fn = resolveChatModelCall(picked);
  if (!fn) throw new Error('模型「' + (modelNameById(picked) || picked) + '」无法调用，请到「大模型配置」检查它的接口地址和协议');
  var out;
  try {
    out = await fn(messages);
  } catch (e) {
    console.warn('[callModuleChat:' + moduleKey + '] ' + picked + ' failed:', e && e.message);
    var name = modelNameById(picked) || picked;
    var why = (e && (e.isRateLimit || e.status === 429)) ? '请求过多（429），稍等一会儿重试'
      : (e && e.message) ? e.message : '未知错误';
    var err = new Error('模型「' + name + '」调用失败：' + why + '。可稍后重试，或在上方下拉框换一个模型。');
    err.status = e && e.status;
    err.isRateLimit = e && e.isRateLimit;
    throw err;
  }
  if (!out || !out.trim()) {
    throw new Error('模型「' + (modelNameById(picked) || picked) + '」返回了空内容，请重试或换一个模型。');
  }
  return { text: out, modelId: picked };
}

function modelNameById(id) {
  try {
    var models = getModels();
    for (var i = 0; i < models.length; i++) if (models[i].id === id) return models[i].name;
  } catch (e) {}
  return id;
}

// ---- 下拉框组件：列出动态模型 + "设为默认" ----
function buildModelPickerHTML(moduleKey, label) {
  var type = MODULE_MODEL_TYPE[moduleKey];
  var avail = getModelsByType(type);
  var typeIcon = ({ text: '📝', image: '🖼️', video: '🎬' })[type] || '🤖';
  // 无可用模型：提示用户去添加，点击一键跳到「大模型配置」
  if (!avail.length) {
    var typeLabel = (type === 'video') ? (window.currentLang === 'en' ? 'video' : '视频')
      : (type === 'image') ? (window.currentLang === 'en' ? 'image' : '图片')
      : (window.currentLang === 'en' ? 'text' : '文本');
    var tip = (window.currentLang === 'en')
      ? ('No ' + typeLabel + ' model configured — click to add one')
      : ('尚未配置' + typeLabel + '大模型，点击去添加');
    return '<button class="btn btn-outline btn-sm" onclick="gotoAddModel()" '
      + 'style="padding:6px 12px;font-size:12px;border-style:dashed;border-color:var(--accent);color:var(--accent-light);white-space:nowrap;">'
      + '➕ ' + tip + '</button>';
  }
  var cur = getPickerRenderModelId(moduleKey);
  // 标签走 i18n：优先按模块取专用键，否则用传入 label
  var labelKey = (moduleKey === 'hotspot') ? 'picker.label.hotspot'
    : (moduleKey === 'freeqa') ? 'picker.label.freeqa'
    // video-script / vc-script / image-prompt 是文本模块，但跟同页的视觉模块并排显示，
    // 都叫"文案模型"分不清哪个管什么，所以各给一个专用标签。
    : (moduleKey === 'video-script' || moduleKey === 'vc-script') ? 'picker.label.script'
    : (moduleKey === 'image-prompt') ? 'picker.label.imageprompt'
    : (type === 'video') ? 'picker.label.video'
    : (type === 'image') ? 'picker.label.image'
    : 'picker.label.text';
  // vc-script 和 video-create 同页并排，各自上方已有一行标题，picker 内部不再重复标签
  var labelText = label ? t(labelKey, label)
    : ((moduleKey === 'image' || moduleKey === 'video-create' || moduleKey === 'vc-script') ? '' : t(labelKey, '模型'));
  var html = (labelText ? '<span style="font-size:13px;color:var(--text-secondary);">' + typeIcon + ' ' + labelText + '：</span>' : '')
    + '<select class="model-picker-select" data-module="' + moduleKey + '" onchange="onModelPickChange(\'' + moduleKey + '\', this.value)" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);font-size:13px;max-width:220px;">';
  for (var i = 0; i < avail.length; i++) {
    html += '<option value="' + avail[i].id + '"' + (avail[i].id === cur ? ' selected' : '') + '>' + avail[i].name + '</option>';
  }
  html += '</select>'
    + '<button class="btn btn-outline btn-sm" onclick="setModuleModelDefault(\'' + moduleKey + '\')" title="把当前选择的模型设为该模块默认" style="padding:6px 10px;font-size:12px;white-space:nowrap;">' + t('picker.setdefault', '⭐ 设为默认') + '</button>'
    + '<span id="mp-defhint-' + moduleKey + '" style="font-size:11px;color:var(--text-secondary);"></span>';
  return html;
}

// 一键跳到「大模型配置」并打开添加弹窗
function gotoAddModel() {
  scrollToSection('models');
  setTimeout(function() { if (typeof openAddModel === 'function') openAddModel(); }, 300);
}

function onModelPickChange(moduleKey, modelId) {
  // 仅切换当前会话选择（不写默认）。必须记进 _sessionModelPicks：
  // 语言切换 / 模型列表刷新都会重渲染 picker，只靠 <select> 自身的 value 会被冲掉。
  window._sessionModelPicks[moduleKey] = modelId;
  var hint = document.getElementById('mp-defhint-' + moduleKey);
  if (hint) hint.textContent = '';
  // 视频模块：把选择同步到旧的短 key 状态变量，避免下拉框与实际调用的模型不一致
  if (MODULE_MODEL_TYPE[moduleKey] === 'video' && typeof syncVideoModelFromPicker === 'function') {
    try { syncVideoModelFromPicker(moduleKey); } catch (e) {}
  }
}

function setModuleModelDefault(moduleKey) {
  var sel = document.querySelector('select.model-picker-select[data-module="' + moduleKey + '"]');
  if (!sel || !sel.value) { showToast('⚠️ 请先选择一个模型'); return; }
  setModuleModelId(moduleKey, sel.value, true);
  // 设为默认后，会话临时选择就没意义了（否则它会盖住刚存的默认值）
  window._sessionModelPicks[moduleKey] = sel.value;
  var hint = document.getElementById('mp-defhint-' + moduleKey);
  if (hint) hint.textContent = (window.currentLang === 'en') ? '✓ default saved' : '✓ 已设为默认';
  showToast('⭐ 已把「' + modelNameById(sel.value) + '」设为该模块默认模型');
}

// 初始化所有 data-model-picker 容器
function initModelPickers() {
  var containers = document.querySelectorAll('[data-model-picker]');
  for (var i = 0; i < containers.length; i++) {
    var key = containers[i].getAttribute('data-model-picker');
    var label = containers[i].getAttribute('data-picker-label') || '模型';
    containers[i].innerHTML = buildModelPickerHTML(key, label);
    // 渲染完立刻把视频模块的选择同步到旧短 key，避免下拉框显示 A 却按 B 生成
    if (MODULE_MODEL_TYPE[key] === 'video' && typeof syncVideoModelFromPicker === 'function') {
      try { syncVideoModelFromPicker(key); } catch (e) {}
    }
  }
}
function refreshAllModelPickers() { initModelPickers(); }

// 当前某模块下拉框选中的模型 id（优先读 UI，未渲染时读默认）
function getPickedModelId(moduleKey) {
  var sel = document.querySelector('select.model-picker-select[data-module="' + moduleKey + '"]');
  if (sel && sel.value) return sel.value;
  return getModuleModelId(moduleKey);
}

// 重新渲染下拉框时该预选哪个 id。
// ⚠️ 不能用 getPickedModelId：它优先读屏幕上那个"旧"的 <select>，
// 而 bootAppData 拉到持久化默认值后会重渲染 picker —— 那时读到的还是旧值，
// 于是"设为默认"刷新后总是被打回去（用户报的 Bug #6）。
// 顺序：本次会话里用户手动改过的选择 > 已持久化的默认值。
window._sessionModelPicks = {};
function getPickerRenderModelId(moduleKey) {
  var sessionPick = window._sessionModelPicks[moduleKey];
  if (sessionPick) {
    // 会话选择也要校验仍然存在且类型匹配，否则退回持久化默认
    var avail = getModelsByType(MODULE_MODEL_TYPE[moduleKey]);
    for (var i = 0; i < avail.length; i++) if (avail[i].id === sessionPick) return sessionPick;
  }
  return getModuleModelId(moduleKey);
}

// ---- 自定义图片模型（OpenAI images 风格） ----
async function _callCustomImageModel(cfg, prompt, n, refImageUrl) {
  n = n || 1;
  var isProxy = (window.location.protocol !== 'file:');
  var reqBody = { model: cfg.model || 'gpt-image-1', prompt: prompt, n: n, size: '1024x1024' };
  if (refImageUrl) reqBody.image = refImageUrl;
  var url, headers, body;
  if (isProxy) {
    url = '/api/custom_model';
    headers = { 'Content-Type': 'application/json' };
    body = { url: cfg.baseUrl, method: 'POST', auth_type: 'bearer', auth_key: cfg.apiKey || '', body: reqBody };
  } else {
    url = cfg.baseUrl;
    headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (cfg.apiKey || '') };
    body = reqBody;
  }
  var resp = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
  if (!resp.ok) { var e = new Error((cfg.name || cfg.id) + ' HTTP ' + resp.status); e.status = resp.status; e.isRateLimit = (resp.status === 429); throw e; }
  var data = await resp.json();
  var urls = [];
  if (data.data && Array.isArray(data.data)) {
    for (var i = 0; i < data.data.length; i++) {
      if (data.data[i].url) urls.push(data.data[i].url);
      else if (data.data[i].b64_json) urls.push('data:image/png;base64,' + data.data[i].b64_json);
    }
  }
  if (!urls.length && data.image_urls) urls = data.image_urls;
  return urls;
}

var IMAGE_MODEL_BUILTIN = {
  'ark-image': function(prompt, n, ref) { return callArkImage(prompt, n, ref); },
  'agnes-image': function(prompt, n, ref) { return callAgnesImage(prompt, n, ref); },
  'minimax-image': function(prompt, n, ref) { return callMiniMaxImage(prompt, n, ref); },
  'hunyuan-image': function(prompt, n, ref) { return callHunyuanImage(prompt, n, ref); }
};
// 各家图片模型的实测状态（2026-08-11），只作为「大模型配置」里 status 的依据备忘：
//   ark-image(Seedream) ✅ 唯一可用
//   agnes-image  ❌ 厂商 90s 超时
//   minimax-image ❌ status_code 2056 额度耗尽
//   hunyuan-image ❌ 端点 404
// 原先这里还有一个 IMAGE_MODEL_PRIORITY 数组，供 callModuleImage 在用户选的模型失败后
// 按序补试。已删除 —— 出图和出文一样，用户在下拉框里选了谁就是谁，失败了报错，不替他换厂商。
// 失效的模型在「大模型配置」里被标 disabled，本来就不会出现在下拉框里，不需要靠这个数组回避。
function resolveImageModelCall(modelId) {
  if (IMAGE_MODEL_BUILTIN[modelId]) return IMAGE_MODEL_BUILTIN[modelId];
  var cfg = null;
  try { var ms = getModels(); for (var i = 0; i < ms.length; i++) if (ms[i].id === modelId) cfg = ms[i]; } catch (e) {}
  if (!cfg) return null;
  return function(prompt, n, ref) { return _callCustomImageModel(cfg, prompt, n, ref); };
}
async function callModuleImage(moduleKey, prompt, n, refImageUrl) {
  n = n || 3;
  var picked = getPickedModelId(moduleKey);
  if (!picked) throw new Error('尚未配置可用的图片大模型，请到「大模型配置」添加一个');
  var fn = resolveImageModelCall(picked);
  if (!fn) throw new Error('图片模型「' + (modelNameById(picked) || picked) + '」无法调用，请到「大模型配置」检查它的接口地址');
  var urls;
  try {
    urls = await fn(prompt, n, refImageUrl);
  } catch (e) {
    console.warn('[callModuleImage:' + moduleKey + '] ' + picked + ' failed:', e && e.message);
    var name = modelNameById(picked) || picked;
    var why = (e && (e.isRateLimit || e.status === 429)) ? '请求过多（429），稍等一会儿重试'
      : (e && e.message) ? e.message : '未知错误';
    var err = new Error('图片模型「' + name + '」出图失败：' + why + '。可稍后重试，或在上方下拉框换一个模型。');
    err.status = e && e.status;
    err.isRateLimit = e && e.isRateLimit;
    throw err;
  }
  if (!urls || !urls.length) {
    throw new Error('图片模型「' + (modelNameById(picked) || picked) + '」没有返回图片，请重试或换一个模型。');
  }
  return urls;
}

var VIDEO_MODEL_BUILTIN = {
  'seedance-mini-video': function(p, cb, d, o, i) { return callSeedanceMiniVideo(p, cb, d, o, i); },
  'agnes-video': function(p, cb, d, o, i) { return callAgnesVideo(p, cb, d, o, i); },
  'agnes-video-25': function(p, cb, d, o, i) { return callAgnesVideo25(p, cb, d, o, i); },
  'hunyuan-video': function(p, cb, d, o, i) { return callHunyuanVideo(p, cb, d, o, i); },
  'minimax-video': function(p, cb, d, o, i) { return callMiniMaxVideo(p, cb, d, o, i); }
};
function resolveVideoModelCall(modelId) {
  if (VIDEO_MODEL_BUILTIN[modelId]) return VIDEO_MODEL_BUILTIN[modelId];
  return null;  // 自定义视频模型协议差异大，暂只支持内置 4 家
}

// 把模块下拉框选的视频模型 id 映射回旧的短 key（seedance-mini/agnes/hunyuan/minimax）
// 未知 id（用户自定义视频模型）返回 null，交由 callModuleVideo 走通用降级，
// 不再一律当成 'seedance-mini'（会导致下拉框选 A、实际调 B）。
function _videoShortKey(modelId) {
  var map = { 'seedance-mini-video': 'seedance-mini', 'agnes-video': 'agnes', 'agnes-video-25': 'agnes25', 'hunyuan-video': 'hunyuan', 'minimax-video': 'minimax' };
  return map[modelId] || null;
}
function syncVideoModelFromPicker(moduleKey) {
  var id = getPickedModelId(moduleKey);
  var short = _videoShortKey(id);
  if (!short) return null;   // 自定义模型：保持原状态变量不动
  if (moduleKey === 'video-create') { vcSelectedModel = short; }
  else { selectedVideoModel = short; }
  return short;
}
async function callModuleVideo(moduleKey, prompt, onProgress, dur) {
  var picked = getPickedModelId(moduleKey);
  if (!picked) throw new Error('尚未配置可用的视频大模型，请到「大模型配置」添加一个');
  var fn = resolveVideoModelCall(picked);
  if (!fn) throw new Error('视频模型「' + (modelNameById(picked) || picked) + '」暂不支持（自定义视频模型协议差异大，目前只支持内置几家），请在上方下拉框换一个。');
  var url;
  try {
    url = await fn(prompt, onProgress, dur);
  } catch (e) {
    console.warn('[callModuleVideo:' + moduleKey + '] ' + picked + ' failed:', e && e.message);
    var name = modelNameById(picked) || picked;
    // 视频厂商的报错本身就写得很具体（排队中 / 余额不足 / 参数非法），原样带出来，
    // 别再包一层"未知错误"把它盖掉。
    var why = (e && e.message) ? e.message : '未知错误';
    var err = new Error('视频模型「' + name + '」生成失败：' + why);
    err.status = e && e.status;
    err.isRateLimit = e && e.isRateLimit;
    throw err;
  }
  if (!url) {
    throw new Error('视频模型「' + (modelNameById(picked) || picked) + '」没有返回视频地址，请重试或换一个模型。');
  }
  return url;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { initModelPickers(); });
} else {
  setTimeout(function() { initModelPickers(); }, 0);
}

// 调用 MiniMax 图片生成 API
async function callMiniMaxImage(prompt, n, refImageUrl) {
  var body = {
    model: 'image-01',
    prompt: prompt,
    aspect_ratio: '16:9',
    n: n || 3,
    response_format: 'url',
    prompt_optimizer: true
  };
  if (refImageUrl) body.image_url = refImageUrl;
  var response = await fetch(MM_IMAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + MM_API_KEY
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error('Image API HTTP ' + response.status);
  var data = await response.json();
  if (data.base_resp && data.base_resp.status_code === 0 && data.data && data.data.image_urls) {
    return data.data.image_urls;
  }
  throw new Error(data.base_resp ? data.base_resp.status_msg : 'Image API error');
}

// 调用 MiniMax 视频生成 API（异步轮询）
async function callMiniMaxVideo(prompt, onProgress, durationSec, opts, imageRef) {
  var dur = durationSec || 6;
  // 1. 创建视频任务
  var body = {
    model: 'T2V-01',
    prompt: prompt + '。视频总时长：' + dur + '秒。',
    duration: dur,
    resolution: '768P'
  };
  if (imageRef) body.image_url = imageRef;
  var createResp = await fetch(MM_VIDEO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + MM_API_KEY
    },
    body: JSON.stringify(body)
  });
  var createData = await createResp.json();
  if (createData.base_resp && createData.base_resp.status_code !== 0) {
    throw new Error(createData.base_resp.status_msg || 'Video create failed');
  }
  var taskId = createData.task_id;
  if (!taskId) throw new Error('No task_id returned');

  // 2. 轮询查询任务状态
  var maxRetries = 60;
  for (var i = 0; i < maxRetries; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); }); // wait 5s
    var queryResp = await fetch(MM_VIDEO_QUERY_URL + '?task_id=' + taskId, {
      headers: { 'Authorization': 'Bearer ' + MM_API_KEY }
    });
    var queryData = await queryResp.json();
    if (onProgress) onProgress(i + 1, maxRetries, queryData.status);
    if (queryData.status === 'completed') {
      return queryData.video_url;
    }
    if (queryData.status === 'failed') {
      throw new Error('Video generation failed');
    }
  }
  throw new Error('Video generation timed out');
}

// 调用腾讯混元 HunyuanVideo API（异步轮询）
// 调用 Agnes AI 视频生成 API
async function callAgnesVideo(prompt, onProgress, durationSec, opts, imageRef) {
  opts = opts || {};
  // 2026-08-24 实测：厂商把 /v1/videos 的请求体换成了 v2.5 那套 schema，
  // V2.0 也跟着走同一套。旧字段现在会被硬拒：
  //   duration   → 400 "duration is not an allowed request field"（用户报的第一条）
  //   resolution → 400 "resolution is not an allowed request field"
  //   size:'768x768' 这种像素写法也不再收，改成 '720P' 档位
  // 新增必填 mode，取值是**枚举**，不是自由字符串。我最初填 'text'（想当然的"文生视频"），
  // 用户拿到第二条 400：
  //   "Input should be 'ti2vid', 'keyframes' or 'multi_reference'"
  // 文生视频对应 'ti2vid'（text-image to video）。另两个是关键帧 / 多参考图模式。
  // seconds **必须是字符串**，传数字会 400
  //   "cannot unmarshal number into Go struct field ... seconds of type string"
  // 实测通过的组合（直连厂商 HTTP 200 queued）：
  //   {model:'agnes-video-v2.0', prompt:'…', mode:'ti2vid', seconds:'5',
  //    size:'720P', aspect_ratio:'16:9', n:1}
  // 注意厂商回包里的 size 是它自己换算的实际像素（如 1088x832），不等于你传的档位。
  var secs = parseInt(durationSec, 10) || 5;
  if (secs < 4) secs = 4;
  if (secs > 12) secs = 12;

  // 画幅只放行厂商白名单，其余回落 16:9（auto 或任意比例都会被拒）
  var okRatios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
  var ratio = opts.aspectRatio && okRatios.indexOf(opts.aspectRatio) !== -1 ? opts.aspectRatio : '16:9';

  // 带参考图时：
  //   - ti2vid（text-image to video）：接受 1 张 image，作为视频首帧/初始画面
  //   - multi_reference：需要至少 2 张图（+ 可选 background_image），用于风格迁移
  //   - keyframes：需要多张图指定关键帧
  // 用户只传了一张图 → 走 ti2vid（不是 multi_reference，后者要求 ≥2 张）。
  // 注意：ti2vid 模式下 image 字段名是 image（不是 image_url），与 V2.5 不同。
  var mode = 'ti2vid';

  // 1. 提交视频生成任务
  var body = {
    model: 'agnes-video-v2.0',
    prompt: prompt,
    mode: mode,
    seconds: String(secs),
    size: '720P',
    aspect_ratio: ratio,
    n: 1
  };
  if (imageRef) body.image = imageRef;

  var submitResp = await fetch(AGNES_VIDEO_SUBMIT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + AGNES_API_KEY
    },
    body: JSON.stringify(body)
  });
  var submitData = await submitResp.json().catch(function() { return {}; });
  if (!submitResp.ok) {
    // 队列满和限流都是**暂时**的，别让用户以为是自己参数填错了去反复改设置。
    // 503 的文案厂商用过两种，都要认：
    //   {"code":"video_queue_full"}                 —— 早期
    //   "Service busy: inference slot is in use."    —— 2026-08-24 实测新增
    // 只匹配 queue.*full 会让后者掉进下面那条笼统的"提交失败 HTTP 503"，
    // 用户看到一长串 litellm 嵌套 JSON，会以为是参数错。
    if (submitResp.status === 503) {
      throw new Error('Agnes AI 排队中（厂商队列或推理槽已满），稍等一两分钟重试即可 —— 不是参数问题。也可切到 Seedance 2 Mini。');
    }
    if (submitResp.status === 429) {
      throw new Error('Agnes AI 触发限流（视频每分钟 6 次），稍等一分钟再试。');
    }
    throw new Error('Agnes AI 提交失败 HTTP ' + submitResp.status + '：' + JSON.stringify(submitData).slice(0, 300));
  }
  if (submitData.error) {
    throw new Error(submitData.error.message || JSON.stringify(submitData.error));
  }
  var taskId = submitData.id;
  var videoId = submitData.video_id || taskId;
  if (!taskId) throw new Error('No task id returned from Agnes AI API');

  // 2. 轮询查询任务状态（GET 请求，把 task_id 放在 URL 路径中）
  var maxRetries = 60;
  for (var i = 0; i < maxRetries; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); }); // wait 5s
    var queryResp = await fetch(AGNES_VIDEO_QUERY_URL + '/' + encodeURIComponent(taskId), {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + AGNES_API_KEY
      }
    });
    // 429 不当失败：厂商对视频接口限流（实测 6 次/分钟），而这里 5 秒一轮 = 12 次/分钟，
    // 排队久了必然撞上。退避后重试，别把限流当成生成失败。
    if (queryResp.status === 429) {
      if (onProgress) onProgress(i + 1, maxRetries, '厂商限流，退避重试中');
      await new Promise(function(r) { setTimeout(r, 10000); });
      continue;
    }
    var queryData = await queryResp.json();
    var status = (queryData.status || '').toLowerCase();
    if (onProgress) onProgress(i + 1, maxRetries, status);

    if (status === 'completed' || status === 'succeeded') {
      // 视频地址位置厂商换过：早前在 metadata.url，2026-08-24 端到端复测是**顶层 url**
      //（metadata 整个为 null）。所以不写死路径，统一交给 findFirstVideoUrl 深度递归查找 ——
      // 只查 data/output/url 三处的旧写法曾导致任务明明成功却抛 "returned no video url"。
      var videoUrl = findFirstVideoUrl(queryData);
      if (!videoUrl) throw new Error('Agnes AI 未返回视频地址，原始响应：' + JSON.stringify(queryData).slice(0, 500));
      return videoUrl;
    }
    if (status === 'failed' || status === 'error') {
      throw new Error('Agnes AI video generation failed: ' + (queryData.error ? JSON.stringify(queryData.error) : 'unknown error'));
    }
  }
  throw new Error('Agnes AI 视频生成超时（已等待约 5 分钟仍在排队）。厂商队列繁忙时可稍后重试，或切到 Seedance 2 Mini。');
}

// 调用 Agnes Video 2.5（异步任务，OpenAI Videos 兼容协议）
// 文档：https://agnes-ai.com/zh-Hans/docs/agnes-video-v25
// 与 V2.0 的关键差异（都是踩过的坑，别按 V2.0 的写法改回去）：
//   · seconds 取代 duration，合法区间 4–12 秒（V2.0 是 5/10/15/30）
//   · size 只接受 "720P" 这个档位字符串；写成 "1280x720" 会 400，
//     具体分辨率靠 aspect_ratio 选（16:9→1280x720，9:16→720x1280 等）
//   · mode 字段：实测 V2.5 **不认** mode 字段（返回 invalid mode），
//     而 V2.0 需要 mode 枚举（ti2vid / multi_reference）。
//     所以 V2.5 提交时**不要传 mode**。
//   · n 只能是 1；width/height/fps/quality 等字段传了就 400
//   · 参考图：V2.5 没有文档化的参考图模式（先试了 first_frame/last_frame 都拒收），
//     最安全的做法是：有参考图时直接回落 V2.0（V2.0 的 ti2vid + image 已验证可用）
async function callAgnesVideo25(prompt, onProgress, durationSec, opts, imageRef) {
  opts = opts || {};
  // 4–12 秒硬夹。上游 UI 允许到 60 秒，直接透传必然 400。
  var secs = parseInt(durationSec, 10) || 5;
  if (secs < 4) secs = 4;
  if (secs > 12) secs = 12;

  // 只放行文档白名单里的画幅，其余一律回落 16:9（auto 和任意比例都会被厂商拒）
  var okRatios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
  var ratio = opts.aspectRatio && okRatios.indexOf(opts.aspectRatio) !== -1 ? opts.aspectRatio : '16:9';

  // V2.5 不接受 mode 字段，也不支持参考图（文档化功能），有图就回落 V2.0
  if (imageRef) {
    return callAgnesVideo(prompt, onProgress, durationSec, opts, imageRef);
  }

  var payload = {
    model: 'agnes-video-2.5',
    prompt: prompt,
    // seconds 必须是**字符串**：2026-08-24 实测传数字会 400
    seconds: String(secs),
    // ⚠️ 不要传 mode！V2.5 会返回 {"code":"invalid_request","message":"invalid mode"}
    size: '720P',
    aspect_ratio: ratio,
    n: 1
  };

  var submitResp = await fetch(AGNES_V25_SUBMIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AGNES_API_KEY },
    body: JSON.stringify(payload)
  });
  var submitData = await submitResp.json().catch(function() { return {}; });
  if (!submitResp.ok) {
    var em = (submitData && submitData.error && submitData.error.message) || (submitData && submitData.message) || '';
    // 2026-08-24 复测：厂商**已上线**（不再返回 model_not_found），所以 503 的含义变了 ——
    // 现在是"队列/推理槽占满"这类暂时状态，不能再报"尚未上线"误导用户。
    if (submitResp.status === 503) {
      throw new Error('Agnes Video 2.5 排队中（厂商队列或推理槽已满），稍等一两分钟重试 —— 不是参数问题。也可用 Agnes Video V2.0 或 Seedance 2 Mini。');
    }
    // 真正拦住 2.5 的是余额：单次约 $0.125，账号额度不够就 403 insufficient_user_quota。
    // 这条要单独说清楚，否则用户会去反复调时长/画幅，怎么改都不通。
    if (submitResp.status === 403 || /insufficient_user_quota|额度/i.test(em)) {
      throw new Error('Agnes Video 2.5 账号额度不足（单次约 $0.125）：' + (em || 'insufficient_user_quota') + '。请充值，或改用 Agnes Video V2.0 / Seedance 2 Mini。');
    }
    // 兜底也提示一下 model_not_found —— 万一厂商又下线了，别让人以为是参数问题
    if (/no available channel|model_not_found/i.test(em)) {
      throw new Error('Agnes Video 2.5 厂商侧当前不可用（' + em + '）。可先用 Agnes Video V2.0 或 Seedance 2 Mini。');
    }
    throw new Error('Agnes Video 2.5 提交失败 HTTP ' + submitResp.status + '：' + JSON.stringify(submitData).slice(0, 300));
  }
  if (submitData.error) throw new Error(submitData.error.message || JSON.stringify(submitData.error));
  var taskId = submitData.id;
  if (!taskId) throw new Error('Agnes Video 2.5 未返回任务 id');

  // 轮询：文档建议 1–2 秒一次，这里 3 秒 × 100 次 ≈ 5 分钟上限，兼顾服务器压力
  var maxRetries = 100;
  for (var i = 0; i < maxRetries; i++) {
    await new Promise(function(r) { setTimeout(r, 3000); });
    var queryResp = await fetch(AGNES_V25_QUERY_URL + '/' + encodeURIComponent(taskId), {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + AGNES_API_KEY }
    });
    // 429 不当失败：按文档退避后重试，别把限流当成生成失败
    if (queryResp.status === 429) {
      if (onProgress) onProgress(i + 1, maxRetries, 'rate limited, backing off');
      await new Promise(function(r) { setTimeout(r, 5000); });
      continue;
    }
    var queryData = await queryResp.json().catch(function() { return {}; });
    var status = (queryData.status || '').toLowerCase();
    if (onProgress) onProgress(i + 1, maxRetries, status + (queryData.progress != null ? ' ' + queryData.progress + '%' : ''));

    if (status === 'completed' || status === 'succeeded') {
      // 完成后 url 在顶层；仍走 findFirstVideoUrl 兜底（厂商换过一次位置，写死会再坏）
      var videoUrl = queryData.url || findFirstVideoUrl(queryData);
      if (!videoUrl) throw new Error('Agnes Video 2.5 未返回视频地址，原始响应：' + JSON.stringify(queryData).slice(0, 500));
      return videoUrl;
    }
    if (status === 'failed' || status === 'error') {
      var msg = (queryData.error && (queryData.error.message || JSON.stringify(queryData.error))) || 'unknown error';
      throw new Error('Agnes Video 2.5 生成失败：' + msg);
    }
  }
  throw new Error('Agnes Video 2.5 生成超时');
}

// 调用 Seedance 2 Mini 视频生成 API（AggregateAPI 异步轮询）
async function callSeedanceMiniVideo(prompt, onProgress, durationSec, opts, imageRef) {
  var dur = durationSec || 5;
  var aspectRatio = '16:9';
  var cfg = getModelRuntimeConfig('seedance-mini-video', {
    baseUrl: SEEDANCE_MINI_API_URL,
    apiKey: SEEDANCE_MINI_API_KEY,
    providerSlug: SEEDANCE_MINI_PROVIDER_SLUG,
    model: SEEDANCE_MINI_MODEL
  });
  var taskApiUrl = USE_PROXY ? '/api/seedance_mini' : normalizeSeedanceTaskUrl(cfg.baseUrl || SEEDANCE_MINI_API_URL);
  var apiKey = cfg.apiKey || SEEDANCE_MINI_API_KEY;
  var providerSlug = cfg.providerSlug || SEEDANCE_MINI_PROVIDER_SLUG;
  var modelId = cfg.model || SEEDANCE_MINI_MODEL;
  // AggregateAPI 的模型 id 必须带厂商前缀：'seedance-2-mini' 会返回 model_not_found，
  // 正确值是 'bytedance/seedance-2-mini'。这里兜底修正用户/旧配置里写错的短名。
  if (/^(seedance[-_]?2?[-_]?mini)$/i.test(modelId)) modelId = 'bytedance/seedance-2-mini';

  if (onProgress) onProgress(0, 60, '提交任务中');
  var body = {
    model: modelId,
    prompt: prompt,
    aspect_ratio: aspectRatio,
    duration: dur + 's'
  };
  if (imageRef) body.image_url = imageRef;
  var createResp = await fetch(taskApiUrl + '/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify(body)
  });
  var createText = await createResp.text();
  var createData = {};
  try { createData = createText ? JSON.parse(createText) : {}; } catch(e) { createData = { raw: createText }; }
  if (!createResp.ok || createData.error || createData.success === false) {
    throw new Error('Seedance 2 Mini 任务创建失败：' + getTaskErrorFromResponse(createData));
  }
  var taskId = getTaskIdFromResponse(createData);
  var directUrl = findFirstVideoUrl(createData);
  if (directUrl) return directUrl;
  if (!taskId) throw new Error('Seedance 2 Mini API 未返回 taskId，原始响应：' + JSON.stringify(createData).slice(0, 500));
  // 创建响应里会带回真正的 providerSlug（如 'kie-oai'），优先用它，避免写死的 slug 对不上
  if (createData.providerSlug) providerSlug = createData.providerSlug;

  // 实测 Seedance 生成一条 5s 视频约需 195s，60 次 ×5s = 300s 太紧，放宽到 90 次（7.5 分钟）
  var maxRetries = 90;
  for (var i = 0; i < maxRetries; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); });
    var queryResp = await fetch(taskApiUrl + '/status?taskId=' + encodeURIComponent(taskId) + '&providerSlug=' + encodeURIComponent(providerSlug), {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });
    var queryText = await queryResp.text();
    var queryData = {};
    try { queryData = queryText ? JSON.parse(queryText) : {}; } catch(e) { queryData = { raw: queryText }; }
    if (!queryResp.ok || queryData.error) {
      throw new Error('Seedance 2 Mini 状态查询失败：' + getTaskErrorFromResponse(queryData));
    }
    var state = getTaskStateFromResponse(queryData);
    var videoUrl = findFirstVideoUrl(queryData);
    if (onProgress) onProgress(i + 1, maxRetries, state + (videoUrl ? '，已获取视频地址' : ''));
    if (videoUrl) return videoUrl;
    if (state === 'completed') throw new Error('Seedance 2 Mini 任务已完成，但响应中未找到视频地址：' + JSON.stringify(queryData).slice(0, 500));
    if (state === 'failed') throw new Error('Seedance 2 Mini 视频生成失败：' + getTaskErrorFromResponse(queryData));
  }
  throw new Error('Seedance 2 Mini 视频生成超时（超过7分钟），taskId=' + taskId);
}

async function callHunyuanVideo(prompt, onProgress, durationSec, opts, imageRef) {
  var dur = durationSec || 6;
  // 1. 提交视频生成任务（将时长写入 prompt，混元 API 会根据 prompt 理解时长）
  var body = {
    model: 'hy-video-1.5',
    prompt: prompt + '。This video must be exactly ' + dur + ' seconds long.'
  };
  if (imageRef) body.init_image = imageRef;
  var submitResp = await fetch(HY_SUBMIT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + HY_API_KEY
    },
    body: JSON.stringify(body)
  });
  var submitData = await submitResp.json();
  if (submitData.error) {
    throw new Error(submitData.error.message || JSON.stringify(submitData.error));
  }
  var taskId = submitData.id;
  if (!taskId) throw new Error('No task id returned from Hunyuan API');

  // 2. 轮询查询任务状态
  var maxRetries = 60;
  for (var i = 0; i < maxRetries; i++) {
    await new Promise(function(r) { setTimeout(r, 5000); }); // wait 5s
    var queryResp = await fetch(HY_QUERY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + HY_API_KEY
      },
      body: JSON.stringify({
        model: 'hy-video-1.5',
        id: taskId
      })
    });
    var queryData = await queryResp.json();
    var status = (queryData.status || '').toLowerCase();
    if (onProgress) onProgress(i + 1, maxRetries, status);

    if (status === 'completed') {
      var videoUrl = (queryData.data && queryData.data.url) ? queryData.data.url : '';
      if (!videoUrl) throw new Error('Hunyuan API returned no video url');
      return videoUrl;
    }
    if (status === 'failed') {
      throw new Error('Hunyuan video generation failed: ' + (queryData.error ? JSON.stringify(queryData.error) : 'unknown error'));
    }
  }
  throw new Error('Hunyuan video generation timed out');
}

// ============ 视频背景音乐控制 ============
function switchBgm(bgmId) {
  currentBgmId = bgmId;
  // 停止旧音频
  if (currentBgmAudio) {
    currentBgmAudio.pause();
    currentBgmAudio = null;
  }
  var track = bgmTracks.find(function(t) { return t.id === bgmId; });
  if (!track || !track.url) return;

  currentBgmAudio = new Audio(track.url);
  currentBgmAudio.loop = true;
  currentBgmAudio.volume = 0.35;
  currentBgmAudio.onerror = function() {
    document.getElementById('bgmStatus').textContent = '⚠️ 音频加载失败，请换一首';
    currentBgmAudio = null;
  };
  currentBgmAudio.oncanplay = function() {
    document.getElementById('bgmStatus').textContent = '♪ ' + track.label + ' 已就绪';
  };
  document.getElementById('bgmStatus').textContent = '♪ 加载中...';
}

function syncBgmWithVideo(videoEl) {
  if (!currentBgmAudio) return;
  videoEl.addEventListener('play', function() {
    if (currentBgmAudio && currentBgmAudio.paused) currentBgmAudio.play();
  });
  videoEl.addEventListener('pause', function() {
    if (currentBgmAudio && !currentBgmAudio.paused) currentBgmAudio.pause();
  });
  videoEl.addEventListener('ended', function() {
    if (currentBgmAudio && !currentBgmAudio.paused) currentBgmAudio.pause();
  });
  videoEl.addEventListener('seeked', function() {
    if (currentBgmAudio) { currentBgmAudio.currentTime = videoEl.currentTime % (currentBgmAudio.duration || 30); }
  });
}

function buildBgmSelectorHtml() {
  var html = '<div style="margin-top:12px;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px dashed var(--accent);">';
  html += '<p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">🎵 混元视频为无声视频，选择背景音乐：</p>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">';
  for (var i = 0; i < bgmTracks.length; i++) {
    var t = bgmTracks[i];
    html += '<button class="bgm-chip" data-bgm="' + t.id + '" onclick="switchBgm(\'' + t.id + '\');var v=document.getElementById(\'videoResultVideo\');if(v)syncBgmWithVideo(v);" style="font-size:12px;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-primary);cursor:pointer;transition:all 0.2s;">' + t.label + '</button>';
  }
  html += '</div>';
  html += '<span id="bgmStatus" style="font-size:11px;color:var(--text-secondary);">选择背景音乐后播放视频时自动播放</span>';
  html += '</div>';
  return html;
}

// ============ 操作演示视频 ============
// src 不写在 HTML 里，等用户真的进到这一区才挂上（见 section-demo 注释）。
// 55MB 的文件，preload="none" 只是不预取，但写了 src 部分浏览器仍会发探测请求。
var _demoSrcLoaded = false;
function initDemoVideo() {
  var v = document.getElementById('demoVideo');
  if (!v || _demoSrcLoaded) return;
  _demoSrcLoaded = true;
  var err = document.getElementById('demoError');
  // 失败要说出来。默认行为是播放器显示一个空白黑框，用户无法区分
  // "还在加载" / "服务器上没这个文件"（部署脚本曾把 *.mp4 排除掉）。
  v.addEventListener('error', function() {
    if (err) err.style.display = 'block';
  });
  v.addEventListener('loadeddata', function() {
    if (err) err.style.display = 'none';
  });
  v.src = '/demo.mp4';
}

// 单页导航下不需要 IntersectionObserver 了：section 是"整块显示/整块隐藏"，
// 不存在"用户手动滚到演示区"这条路径，scrollToSection 里那句 initDemoVideo()
// 就是唯一入口。留着 observer 反而会在隐藏元素上永久挂着回调。

// 离开演示区就暂停：否则用户点去别的菜单后，视频还在后台放，声音跟着走
function pauseDemoVideo() {
  var v = document.getElementById('demoVideo');
  if (v && !v.paused) { try { v.pause(); } catch (e) {} }
}

// ============ 单页导航 ============
// 名字保持 scrollToSection 不改：全站 33 处调用（26 个菜单 onclick + 若干
// 跨模块跳转）都走这一个入口，改名等于无谓地改 33 个地方。它现在做的是
// "切页"而不是"滚动"，行为变了、契约没变。
function scrollToSection(section) {
  var el = document.getElementById('section-' + section);
  // 目标不存在就原地不动。否则会把当前页藏掉、又没有新页显示出来，
  // 整个工作区变成一片空白 —— 比什么都不做糟得多。
  if (!el) return;
  // 被锁的页（非管理员的 IP统计/账号管理/用户管理）同样不切。
  // 原来靠"菜单项 display:none"防住入口就够了，单页导航下不行：
  // 真切过去会把当前页藏掉、目标页又被 .section-locked 压着不显示，
  // 结果是整块空白。这里挡住，当前页保持不动。
  if (el.classList.contains('section-locked')) return;
  currentSection = section;

  var all = document.querySelectorAll('.section');
  for (var i = 0; i < all.length; i++) { all[i].classList.remove('active'); }
  el.classList.add('active');

  // 每页都从顶部开始看。不重置的话，从一个长页切到短页会停在上一页的
  // 滚动位置上，短页因为不够长而显示为空白。
  if (mainContent) mainContent.scrollTop = 0;

  updateNavActive(section);
  // 刻意**不动**左侧导航栏的 scrollTop：
  // 原来这里强制 sidebar.scrollTop = 0，结果点底部菜单（大模型选购 / 操作演示 /
  // 用户中心）时导航栏会瞬间弹回顶部，刚点的那一项被滚出视口 —— 用户想连着点
  // 相邻的两项时得重新往下滚一次。导航栏保持在用户自己滚到的位置才对。
  if (section === 'video') { updateVideoSourceSelect(); }
  if (section === 'demo') { initDemoVideo(); } else { pauseDemoVideo(); }
}

var mainContent = document.getElementById('mainContent');

// 原来这里有个 scroll 监听 + 一份手写的 23 项 section 顺序数组，靠 offsetTop
// 反推"当前在哪一区"。单页导航下当前页由 scrollToSection 直接决定，
// 不需要反推；那份数组也一并去掉 —— 它曾漏掉 5 项导致高亮错位，
// 是典型的"必须跟 DOM 顺序手工同步"的隐患。

function updateNavActive(section) {
  var navs = document.querySelectorAll('.nav-item');
  for (var i = 0; i < navs.length; i++) { navs[i].classList.remove('active'); }
  var nav = document.getElementById('nav-' + section);
  if (nav) nav.classList.add('active');
}

// ============ 拖拽 / 粘贴上传图片（三处上传口共用） ============
// 界面文案一直写着"或直接拖拽到此处"，但此前全项目一个 drop 处理器都没有 ——
// 用户拖图进去只会被浏览器当成"打开这个文件"，整页被图片替换掉，比没承诺更糟。
// 这里做成通用的：给一个容器绑好 dragover/dragleave/drop，拿到 File[] 后交给回调，
// 各处该缩放的缩放、该预览的预览，行为和点击选文件完全一致。
//
// dragleave 的坑：鼠标从容器移到它的子元素上也会触发 dragleave，只靠布尔量会疯狂闪。
// 用进入/离开计数配平，归零才真正移除高亮。
function bindImageDropZone(el, onFiles, opts) {
  if (!el || el._dropBound) return;
  el._dropBound = true;
  opts = opts || {};
  var depth = 0;

  function hasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt) return false;
    // 拖网页里的图片时 types 里是 text/html + text/uri-list，没有 Files；
    // 那种情况我们不拦（拿不到 File 对象，跨域也读不到），交回浏览器默认行为。
    return Array.prototype.indexOf.call(dt.types || [], 'Files') !== -1;
  }
  function paint(on) { el.classList[on ? 'add' : 'remove']('drag-over'); }

  el.addEventListener('dragenter', function(e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    depth++; paint(true);
  });
  el.addEventListener('dragover', function(e) {
    if (!hasFiles(e)) return;
    // 必须 preventDefault，否则 drop 根本不会触发（浏览器默认把它当导航）
    e.preventDefault(); e.stopPropagation();
    try { e.dataTransfer.dropEffect = 'copy'; } catch (err) {}
    paint(true);
  });
  el.addEventListener('dragleave', function(e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    depth = Math.max(0, depth - 1);
    if (!depth) paint(false);
  });
  el.addEventListener('drop', function(e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    depth = 0; paint(false);
    var all = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
    var imgs = all.filter(function(f) { return /^image\//.test(f.type); });
    if (!imgs.length) {
      // 明确告知而不是静默无事发生：用户拖了个 PDF 进来，得知道为什么没反应
      showToast((window.currentLang === 'en') ? '⚠️ Only image files are supported here'
                                             : '⚠️ 这里只支持图片文件');
      return;
    }
    if (all.length > imgs.length) {
      showToast((window.currentLang === 'en') ? '⚠️ Non-image files were skipped'
                                             : '⚠️ 已忽略非图片文件');
    }
    onFiles(opts.multiple ? imgs : imgs.slice(0, 1));
  });
}

// 整页兜底：拖到板块之外（比如侧栏、空白处）时阻止浏览器"直接打开这张图"。
// 少了这一步，用户稍微没瞄准就会整页跳走，刚打的字全没了。
(function bindGlobalDropGuard() {
  function guard(e) {
    var dt = e.dataTransfer;
    if (!dt || Array.prototype.indexOf.call(dt.types || [], 'Files') === -1) return;
    // 已经落在注册过的落区里就别管，交给它自己处理
    if (e.target && e.target.closest && e.target.closest('.image-upload-area, #vcRefDropzone, #fqDropZone')) return;
    e.preventDefault();
    if (e.type === 'drop') {
      try { e.dataTransfer.dropEffect = 'none'; } catch (err) {}
    }
  }
  window.addEventListener('dragover', guard);
  window.addEventListener('drop', guard);
})();

// ============ 图片创作 ============
var generatedImages = []; // 持久化保存，切换栏目不丢失
var imageRefDataUrl = null; // 参考图的 base64

function handleRefImageUpload(e) {
  _applyRefImageFile(e.target.files && e.target.files[0]);
}

// 抽出来的落地逻辑：点击选文件和拖拽落图都走这里，保证两条路行为一致
// （同样的 10MB 上限、同样的预览与状态切换），而不是拖拽版偷偷少几步校验。
function _applyRefImageFile(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    showToast((window.currentLang === 'en') ? '⚠️ Only image files are supported' : '⚠️ 只支持图片文件');
    return;
  }
  if (file.size > 10 * 1024 * 1024) { showToast('图片大小不能超过10MB'); return; }
  var reader = new FileReader();
  reader.onload = function(ev) {
    imageRefDataUrl = ev.target.result;
    var preview = document.getElementById('imageRefPreview');
    preview.src = imageRefDataUrl;
    preview.style.display = 'block';
    document.getElementById('imageUploadPlaceholder').style.display = 'none';
    document.getElementById('imageUploadArea').classList.add('has-image');
    document.getElementById('imageRefRemove').style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function removeRefImage() {
  imageRefDataUrl = null;
  document.getElementById('imageRefPreview').style.display = 'none';
  document.getElementById('imageUploadPlaceholder').style.display = 'flex';
  document.getElementById('imageUploadArea').classList.remove('has-image');
  document.getElementById('imageRefRemove').style.display = 'none';
  document.getElementById('imageRefInput').value = '';
}

// 10 条国内向热门提示词。选题按国内自媒体最跑量的内容形态铺开：
// 电商主图 / 美妆（美女）/ 型男穿搭 / 美食探店 / 旅游大片 / 数码评测 /
// 社媒广告 / 素人种草 / 大促海报 / 家居好物平铺。
//
// 三条刻意的写法约定，别当成啰嗦删掉：
//   ① 全中文 —— 国内生图模型（Seedream / 豆包 / 混元）对中文 prompt 是原生支持的，
//      而且这些提示词是给用户当模板改的，中文才改得动。
//   ② 每条都写足「主体 + 场景 + 镜头/构图 + 光线 + 风格 + 画幅」六件事。
//      少了镜头和光线，生图模型会退化成随机图库风，这是模板最容易失效的地方。
//   ③ 都留出「标题留白 / 无文字」这类版式信息，因为国内平台的图基本都要二次加字，
//      模型自己画的字（尤其中文）九成会糊。画面内文字的硬约束由
//      ensureCnVisualPrompt() 统一追加，这里不用重复写。
var imageHotPrompts = [
  // 1. 电商主图
  '电商商品主图：一台北欧极简风格的家用加湿器居中悬浮，浅灰到米白的柔和渐变背景，磨砂质感与出雾细节清晰可见，柔光箱侧上方打光，边缘高光干净，1:1 方图，广告级棚拍质感，画面上方留出标题文字空间，无文字无水印',
  // 2. 美妆种草（美女）
  '小红书美妆种草图：亚洲年轻女性半身特写，自然妆感，皮肤纹理真实不磨皮，手持精华瓶靠近脸颊，米色针织与暖木色梳妆台背景，窗边自然光加柔光板补光，85mm 浅景深，通透干净的种草笔记质感，3:4 竖构图',
  // 3. 型男穿褡
  '型男穿搭街拍：亚洲男性全身，工装夹克配直筒牛仔与工装靴，站在城市老街骑楼下，冷灰调水泥墙与霓虹招牌虚化背景，傍晚侧逆光带轮廓光，35mm 街头抓拍视角，轻胶片颗粒，杂志感穿搭大片，3:4 竖构图',
  // 4. 美食探店
  '美食探店大片：砂锅麻辣牛肉刚上桌，红油翻滚热气升腾，特写微距对准辣椒与牛肉纹理，深色木桌与暗调店内环境，顶部小范围硬光压出油润高光，45 度俯拍，暖色调，食欲感极强的探店视觉，4:5 竖构图',
  // 5. 旅游大片
  '旅游风光大片：清晨的川西高原公路，一个背包旅行者背对镜头站在路中央，远处雪山与流云，超广角 16mm 强透视，冷蓝调加暖阳光斑，晨雾与体积光，电影级调色，适合旅行 vlog 封面，16:9 横构图',
  // 6. 数码评测
  '数码开箱评测图：一台深空灰无线降噪耳机与充电盒摆在深灰岩板桌面，旁边散放数据线与卡针，斜侧 30 度构图，冷白顶光加蓝色轮廓补光，金属与磨砂质感反射清晰，科技感强的评测棚拍风格，画面右侧留白放参数说明，16:9',
  // 7. 社媒广告图
  '社媒信息流广告图：亚洲女性在明亮家居客厅用手持挂烫机整理衬衫，动作瞬间定格，高饱和撞色背景板，浅景深突出主体，画面左侧大面积留白用于放标题与价格，节奏感强的电商广告摄影，滑到不想划走的视觉张力，4:5 竖构图',
  // 8. 素人种草
  '素人真实种草实拍：普通女生在自家出租屋卫生间镜前涂身体乳，手机随手拍的轻微晃动感，顶灯与窗光混合的偏黄光线，瓷砖和杂物都在画面里不做美化，皮肤与毛巾质感真实，没有棚拍痕迹的日常生活场景，9:16 竖构图',
  // 9. 大促海报
  '618 大促促销海报背景：多件家居小电呈阶梯式堆叠在中央礼盒台上，红金渐变主色，飘带彩带与光斑营造节日气氛，戏剧性轮廓光，动感对角线构图，画面中部与下部留出大面积空白放价格与优惠信息，高点击率大促视觉，无文字，16:9',
  // 10. 家居好物平铺
  '家居好物平铺图：香薰蜡烛、藤编收纳篮、纯棉毛巾与陶瓷杯整齐摆在暖木色桌面上，正上方 90 度俯拍，窗边自然柔光带轻微阴影，米白与原木色调，日式治愈系杂志平铺质感，物件之间留出呼吸感，1:1 方图'
];

function fillImagePromptByIndex(index) {
  fillImagePrompt(imageHotPrompts[index] || '');
}

function fillImagePrompt(text) {
  var input = document.getElementById('imagePromptInput');
  if (!input) return;
  input.value = text;
  input.focus();
  showToast('已填充图片提示词');
}

// ============ 画面文字约束：给生图/生视频 prompt 统一追加中文硬约束 ============
// 原名 ensureEnglishPrompt。海外版在这里做两件事：先把中文 prompt 翻成英文
// （多打一次文本模型），再硬追加 "All on-screen text MUST be in English only"。
// 国内版这两件事都要反过来：
//   ① 不翻译 —— 生图/生视频走的都是国内模型（Seedream / 豆包 / 混元 / MiniMax /
//      Seedance），中文 prompt 是原生支持的。翻成英文等于每次生成前白等一次
//      模型往返，还要承担一层语义损耗（"种草""探店""型男"这类词翻完就没了）。
//   ② 约束方向反过来 —— 画面里出现英文字幕，发到抖音/小红书就是废片。
//
// 这里刻意**不**做"画面化扩写"：旁边就有显式的「AI优化提示词」按钮干这件事，
// 在这条链路里偷偷再调一次模型，只会让每次生成都无故多等几秒，而且用户
// 看不到扩写结果、改不动。
//
// 保留 async 签名：7 个调用点都在 await 它，不动签名可以把改动面压到最小。
// kind: 'image' | 'video'
async function ensureCnVisualPrompt(rawPrompt, kind) {
  var prompt = String(rawPrompt || '').trim();
  if (!prompt) return prompt;
  var enforcement;
  if (kind === 'video') {
    enforcement = ' | 硬性要求：视频里的字幕、口播、花字、包装文字一律使用简体中文，不要出现英文或乱码字符；口播语言为中文普通话；画面不要出现水印。';
  } else {
    enforcement = ' | 硬性要求：画面内如需出现文字、标签、包装字样，一律使用简体中文，不要出现英文或乱码字符；不需要文字时保持画面无文字、无水印。';
  }
  return prompt + enforcement;
}

// ============ 配图视觉简报：把文章内容翻译成"画面描述" ============
// 为什么需要它：之前根本没有任何环节把文章内容转成画面语言。图片 prompt 是
// 「主题 + 高频词 + 一堆中文风格套话」硬拼的字符串，而"高频词"又来自一个
// 只认中文停用词的提取器（文章是英文的）—— 结果 prompt 里全是 the/and/you，
// 图片模型自然画出与主题无关的东西。
//
// 现在让文本模型扮演 art director 读完文章，直接产出 3 条英文画面描述。
// 返回：长度 3 的字符串数组（一定有 3 条，失败时用 topic 兜底）。
// 「重试配图」：把已生成的文章正文当成素材，走 insertArticleImages 那条成熟链路
// （它自带 buildImageBriefs + callModuleImage 降级 + 落盘），不另写一份配图逻辑。
// generateArticle 渲染出的正文没有 id，这里临时补上 articleTextBody 供其读取。
async function retryArticleImages(btnEl) {
  var host = btnEl && btnEl.closest ? btnEl.closest('.animate-slide-up') : null;
  var bodyEl = host ? host.querySelector('.article-body') : null;
  if (!bodyEl) { showToast('找不到文章正文，请重新生成'); return; }
  var existing = document.getElementById('articleTextBody');
  var restoreId = null;
  if (existing && existing !== bodyEl) { existing.id = ''; restoreId = existing; }
  bodyEl.id = 'articleTextBody';
  if (currentArticle) currentArticle.imagesInserted = false;  // 免掉"已插入过，继续吗"的确认框
  btnEl.disabled = true;
  var label = btnEl.textContent;
  btnEl.textContent = '配图生成中...';
  try {
    await insertArticleImages();
    if (currentArticle && currentArticle.images && currentArticle.images.length) {
      // 成功了就撤掉这条提示条（它整个 div 是按钮的父节点）
      var bar = btnEl.parentNode;
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      return;   // 按钮已随提示条移除，不必恢复
    }
  } catch (e) {
    console.error('[Article] retryArticleImages:', e);
  } finally {
    if (btnEl.parentNode) { btnEl.disabled = false; btnEl.textContent = label; }
    if (bodyEl.id === 'articleTextBody' && restoreId) { bodyEl.id = ''; restoreId.id = 'articleTextBody'; }
  }
}

async function buildImageBriefs(topic, articlePlainText, platformLabel) {
  var topicStr = String(topic || '').trim();
  var body = String(articlePlainText || '').slice(0, 3000);   // 控制 token，开头信息量最大

  // 兜底：至少保证 topic 出现在每一条里 —— topic 是用户/热点给的，永远是准的。
  // 注意这里刻意**不**混入"高频词"，宁可信息少也不要噪音。
  function fallbackBriefs() {
    return [
      topicStr + ' —— 封面主图，杂志级摄影，构图干净，自然光，无文字，无水印',
      topicStr + ' —— 真实使用场景，纪实抓拍，环境真实不摆拍，浅景深，无文字，无水印',
      topicStr + ' —— 局部细节静物，极简现代布景，柔和棚拍光，无文字，无水印'
    ];
  }

  if (!body || body.length < 80) return fallbackBriefs();

  var sys = '你是给文生图模型写画面简报的视觉总监。\n'
    + '读完这篇文章，写出三条画面描述，要让读者一看就知道这三张图属于这篇文章。\n'
    + '规则：\n'
    + '1. 每条都必须点名文章里的具体对象 —— 真实的商品、物件、人物、场所或动作。禁止用"创新""成功""未来""商业概念"这类抽象空话。\n'
    + '2. 只写画面里物理存在的东西：主体、环境、光线、镜头角度、氛围。\n'
    + '3. 第 1 条 = 封面主图；第 2 条 = 主体正在被使用的真实场景；第 3 条 = 同一主体的局部细节或静物。\n'
    + '4. 全部用简体中文，每条 40-80 字，结尾都加"无文字，无水印"。\n'
    + '5. 只输出一个包含 3 个字符串的 JSON 数组，不要 markdown 代码块，不要任何说明。';

  var usr = '文章主题：' + topicStr + '\n'
    + '目标平台调性：' + String(platformLabel || '国内社交媒体') + '\n\n'
    + '文章正文：\n' + body;

  try {
    var raw = await callModuleText('article', sys, usr);
    var txt = String(raw || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    // 模型有时会在 JSON 前后加一句话，抓第一个 [...] 块
    var m = txt.match(/\[[\s\S]*\]/);
    var arr = JSON.parse(m ? m[0] : txt);
    if (!Array.isArray(arr)) throw new Error('not an array');
    var out = [];
    for (var i = 0; i < arr.length && out.length < 3; i++) {
      var s = String(arr[i] == null ? '' : arr[i]).trim();
      if (s.length < 15) continue;                     // 太短的当无效
      // 原来这里有一条 "含中文就丢弃" 的过滤（海外版下游图片模型不认中文）。
      // 国内版正好相反：简报本来就要求中文，那条过滤会把**全部**结果丢掉，
      // 每次都退到 fallbackBriefs()，等于这个函数白调一次模型。已删除。
      out.push(s);
    }
    if (!out.length) throw new Error('no usable prompt');
    // 不足 3 条用兜底补齐，而不是让某个槽位空着
    var fb = fallbackBriefs();
    while (out.length < 3) out.push(fb[out.length]);
    return out;
  } catch (e) {
    console.warn('[buildImageBriefs] 视觉简报生成失败，退回 topic 兜底:', e);
    return fallbackBriefs();
  }
}

// ============ 自由问答 · 多轮对话（文本 / 图片 / 语音 / 联网） ============
// 本板块是项目里第一个对话式模块（其余 23 个都是"填表→生成→出结果"的单向工具），
// 所以这里的状态比别处多一层：fqHistory 是有序的多轮记录，不是一次性的输出缓冲。
//
// 三个刻意的设计取舍：
//   ① 历史裁剪：只把最近 FQ_MAX_TURNS 轮发给模型。不裁的话 token 会随聊天线性膨胀，
//      十几轮后必然超上下文报错 —— 而用户看到的仍是"突然就不能聊了"。
//   ② 图片只带最后一轮：一张 1024px 的 base64 约 200-400KB，历史里累积三四张就把
//      请求体顶到 MB 级；而实际问答里"这张图…"几乎总是指刚发的那张。
//   ③ 图片不入工作区快照：快照上限 512KB（WORKSPACE_MAX_BYTES），一张图就能吃掉大半。
//      刷新后文本历史在、图片变占位标记，比"整个快照存不下而全丢"好得多。
var fqHistory = [];            // [{role:'user'|'assistant', text, images:[dataUrl], sources:[], modelName, ts}]
var fqPendingImages = [];      // 本轮待发送的图片 dataUrl
var fqSending = false;
var FQ_MAX_TURNS = 6;          // 发给模型的最大历史轮数（1 轮 = user + assistant）
var FQ_MAX_IMAGES = 4;         // 单轮最多几张图
var FQ_IMG_MAX_EDGE = 1024;    // 上传图片的最长边，超了先缩放再转 base64

function _fqIsEn() { return window.currentLang === 'en'; }

// ---- 图片选择：缩放 → base64 ----
// 直接 FileReader 读原图（handleRefImageUpload 的做法）在这里不够用：
// 手机拍的图动辄 4000px / 5MB，原样塞进 messages 会让请求体爆掉且明显变慢。
// 先过一遍 canvas 压到 1024px 长边，识别效果几乎没差别，体积降一个量级。
function fqHandleImagePick(input) {
  var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
  input.value = '';                                   // 清空，否则选同一张图第二次不触发 change
  fqAddImageFiles(files);
}

// 点选 / 拖拽 / 粘贴三条入口共用：统一做上限裁剪、类型过滤和缩放入队
function fqAddImageFiles(files) {
  files = (files || []).filter(function(f) { return f && /^image\//.test(f.type); });  // accept 只是提示，可绕过
  if (!files.length) return;
  var room = FQ_MAX_IMAGES - fqPendingImages.length;
  if (room <= 0) {
    showToast(_fqIsEn() ? '⚠️ Up to ' + FQ_MAX_IMAGES + ' images per turn' : '⚠️ 单轮最多 ' + FQ_MAX_IMAGES + ' 张图片');
    return;
  }
  if (files.length > room) {
    showToast(_fqIsEn() ? '⚠️ Only the first ' + room + ' image(s) added' : '⚠️ 已达上限，只添加前 ' + room + ' 张');
    files = files.slice(0, room);
  }
  files.forEach(function(f) {
    _fqShrinkImage(f, function(dataUrl) {
      if (!dataUrl) { showToast(_fqIsEn() ? '⚠️ Failed to read image' : '⚠️ 图片读取失败'); return; }
      if (fqPendingImages.length >= FQ_MAX_IMAGES) return;
      fqPendingImages.push(dataUrl);
      fqRenderImageBar();
    });
  });
}

function _fqShrinkImage(file, cb) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var src = e.target.result;
    var img = new Image();
    img.onload = function() {
      try {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var scale = Math.min(1, FQ_IMG_MAX_EDGE / Math.max(w, h));
        if (scale >= 1 && src.length < 400000) { cb(src); return; }   // 本来就小，不必重编码
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * scale));
        cv.height = Math.max(1, Math.round(h * scale));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        // 统一转 JPEG：PNG 在照片上体积是 JPEG 的好几倍，而这里只用于识别不用于存档
        cb(cv.toDataURL('image/jpeg', 0.85));
      } catch (err) { cb(src); }                       // canvas 失败（跨域污染等）退回原图
    };
    img.onerror = function() { cb(null); };
    img.src = src;
  };
  reader.onerror = function() { cb(null); };
  reader.readAsDataURL(file);
}

function fqRenderImageBar() {
  var bar = document.getElementById('fqImageBar');
  if (!bar) return;
  if (!fqPendingImages.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = 'flex';
  var html = '';
  for (var i = 0; i < fqPendingImages.length; i++) {
    html += '<div style="position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;border:1px solid var(--border);">'
      + '<img src="' + safeUrl(fqPendingImages[i]) + '" style="width:100%;height:100%;object-fit:cover;">'
      + '<button onclick="fqRemoveImage(' + i + ')" title="' + (_fqIsEn() ? 'Remove' : '移除')
      + '" style="position:absolute;top:0;right:0;width:18px;height:18px;line-height:16px;padding:0;border:none;'
      + 'background:rgba(0,0,0,.6);color:#fff;font-size:13px;cursor:pointer;">×</button></div>';
  }
  bar.innerHTML = html;
}

function fqRemoveImage(i) {
  fqPendingImages.splice(i, 1);
  fqRenderImageBar();
}

// 表格单元格内的行内格式。表格是先摘成占位再处理的，所以拿不到后面那批行内规则，
// 这里单独跑一遍。&lt;br&gt; 要还原成真换行 —— 模型在单元格里换行只能靠它。
function _fqInline(s) {
  return String(s)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-tertiary);padding:1px 5px;border-radius:4px;font-size:12px;">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>');
}

// ---- Markdown → HTML（先转义，再套标签）----
// 顺序很关键：模型输出属于不可信文本（它可能被上传的图片或检索到的网页内容影响），
// 必须先 escapeHtml 掉 < > &，再补我们自己认可的那几个标签。
// 反过来做（先套标签再转义）等于把注入点直接暴露在 innerHTML 上。
function fqRenderMarkdown(text) {
  var s = escapeHtml(String(text == null ? '' : text));
  // 代码块：先摘出来占位，避免块内的 * _ # 被后面的行内规则误伤
  var blocks = [];
  s = s.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, function(m, code) {
    blocks.push('<pre style="background:var(--bg-tertiary);padding:10px 12px;border-radius:6px;overflow-x:auto;'
      + 'font-size:12px;line-height:1.6;margin:8px 0;"><code>' + code.replace(/\n$/, '') + '</code></pre>');
    return '\n\nFQZXBLK' + (blocks.length - 1) + '\n\n';
  });
  // 管道表格：实测模型很爱用（问"写个 30 秒脚本"直接回一张分镜表），
  // 不处理的话整张表以 | 竖线原文显示，完全没法读。
  // 和代码块同样先摘成占位，避免表格里的 ** 被行内规则处理两遍。
  s = s.replace(/(?:^[ \t]*\|.+\|[ \t]*$\n?){2,}/gm, function(block) {
    var lines = block.trim().split('\n');
    // 第二行必须是 |---|---| 分隔行，否则不是表格（可能只是连续两行含竖线的正文）
    if (lines.length < 2 || !/^[ \t]*\|[\s:|-]+\|[ \t]*$/.test(lines[1])) return block;
    function cells(line) {
      return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function(c) { return _fqInline(c.trim()); });
    }
    var th = cells(lines[0]);
    var html = '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px;"><thead><tr>';
    for (var i = 0; i < th.length; i++) {
      html += '<th style="border:1px solid var(--border);padding:6px 8px;background:var(--bg-tertiary);text-align:left;">' + th[i] + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (var r = 2; r < lines.length; r++) {
      var td = cells(lines[r]);
      html += '<tr>';
      for (var c = 0; c < th.length; c++) {
        html += '<td style="border:1px solid var(--border);padding:6px 8px;vertical-align:top;">' + (td[c] || '') + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    blocks.push(html);
    return '\n\nFQZXBLK' + (blocks.length - 1) + '\n\n';
  });
  s = s
    .replace(/^#{4,}\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^#\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^\s*&gt;\s?(.+)$/gm, '<blockquote style="border-left:3px solid var(--border);margin:6px 0;padding:2px 0 2px 10px;color:var(--text-secondary);">$1</blockquote>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+[.)]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/`([^`\n]+)`/g, '<code style="background:var(--bg-tertiary);padding:1px 5px;border-radius:4px;font-size:12px;">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, function(m, label, href) {
      return '<a href="' + safeUrl(href) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });
  // 连续的 <li> 收进一个 <ul>（不包的话浏览器渲染出的列表没有缩进和圆点）
  s = s.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, function(m) {
    return '<ul style="margin:6px 0;padding-left:20px;">' + m.replace(/\n/g, '') + '</ul>';
  });
  // 剩下的换行转段落；已经是块级标签的行不再包 <p>
  s = s.split(/\n{2,}/).map(function(para) {
    var p = para.trim();
    if (!p) return '';
    if (/^<(h[1-6]|ul|ol|pre|blockquote|table|div)/i.test(p)) return p;
    if (/^FQZXBLK\d+$/.test(p)) return p;                      // 占位符独占一段，原样放行
    return '<p style="margin:6px 0;line-height:1.75;">' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  return s.replace(/FQZXBLK(\d+)/g, function(m, i) { return blocks[Number(i)] || m; });
}

// ---- 渲染对话 ----
function fqRenderChat() {
  var box = document.getElementById('fqChatBox');
  if (!box) return;
  var cnt = document.getElementById('fqTurnCount');
  if (cnt) {
    var turns = fqHistory.filter(function(m) { return m.role === 'assistant'; }).length;
    cnt.textContent = turns ? (_fqIsEn() ? turns + ' turn(s)' : turns + ' 轮') : '';
  }

  if (!fqHistory.length && !fqSending) {
    box.innerHTML = '<div style="text-align:center;padding:36px 16px;color:var(--text-secondary);font-size:13px;line-height:1.9;">'
      + '<div style="font-size:28px;margin-bottom:8px;">💬</div>'
      + '<div data-i18n="freeqa.empty">' + escapeHtml(t('freeqa.empty', '还没有对话。在上面输入问题，或上传一张图片试试。')) + '</div></div>';
    return;
  }

  // 倒序展示：最新一轮排最上面，最早的沉到最下面。
  //
  // 但只反转"轮"，不反转轮内的两条消息 —— 如果把 fqHistory 整个数组倒着遍历，
  // 每条回答会跑到它自己的问题上面，一轮之内变成"先答后问"，反而没法读。
  // 所以先按"一条 user + 紧随的 assistant"分组，再把组倒过来，组内保持问上答下。
  //
  // 分组里存的是**原始下标**：fqCopyAnswer / fqExportOne 都是拿 i 去索引 fqHistory 的，
  // 用渲染顺序的序号会全部错位（复制到的是另一条回答）。
  var turns = [];
  for (var ti0 = 0; ti0 < fqHistory.length; ti0++) {
    if (fqHistory[ti0].role === 'user' || !turns.length) turns.push([]);
    turns[turns.length - 1].push(ti0);
  }

  var html = '';
  for (var ti = turns.length - 1; ti >= 0; ti--) {
    var isNewest = (ti === turns.length - 1);
    // 倒序后，上一轮的回答会直接贴着下一轮的问题，容易糊成一片；加条细分隔线断开。
    html += '<div style="' + (isNewest ? '' : 'border-top:1px dashed var(--border);margin-top:16px;padding-top:16px;') + '">';
    for (var mi = 0; mi < turns[ti].length; mi++) {
      html += _fqRenderMessage(fqHistory[turns[ti][mi]], turns[ti][mi]);
    }
    // "正在思考"属于最新那一轮，倒序后它跟着最新的问题留在顶部，而不是掉到页面最底下
    if (isNewest && fqSending) {
      html += '<div style="display:flex;align-items:center;gap:8px;color:var(--text-secondary);font-size:13px;padding:6px 0;">'
        + '<span class="fq-dots">⋯</span> ' + escapeHtml(t('freeqa.sending', 'AI 正在思考…')) + '</div>';
    }
    html += '</div>';
  }

  box.innerHTML = html;
  box.scrollTop = 0;   // 最新的在最上面，所以滚到顶（而不是底）才看得到刚出的回答
}

// 单条消息的气泡 HTML。抽出来是因为倒序渲染要按轮调用它，
// 原先内联在循环里的话，分组之后就得把整段复制两遍。
function _fqRenderMessage(m, i) {
  var html = '';
  {
    if (m.role === 'user') {
      html += '<div style="display:flex;justify-content:flex-end;margin-bottom:14px;">'
        + '<div style="max-width:82%;background:var(--accent,#4f46e5);color:#fff;padding:10px 14px;border-radius:12px 12px 2px 12px;font-size:14px;line-height:1.7;word-break:break-word;">';
      if (m.images && m.images.length) {
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">';
        for (var g = 0; g < m.images.length; g++) {
          var iu = safeUrl(m.images[g]);
          if (iu) {
            html += '<img src="' + iu + '" style="width:72px;height:72px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="window.open(this.src)">';
          } else {
            // 刷新后从快照恢复的场景：图片没入库，只剩占位
            html += '<span style="font-size:11px;opacity:.8;">🖼 ' + escapeHtml(_fqIsEn() ? '[image not kept after refresh]' : '[图片刷新后未保留]') + '</span>';
          }
        }
        html += '</div>';
      }
      html += escapeHtml(m.text).replace(/\n/g, '<br>');
      if (m.searched) html += '<div style="font-size:11px;opacity:.85;margin-top:6px;">🌐 ' + escapeHtml(_fqIsEn() ? 'web search on' : '已联网检索') + '</div>';
      html += '</div></div>';
    } else {
      html += '<div style="margin-bottom:18px;">'
        + '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);margin-bottom:5px;">'
        + '<span>🤖 ' + escapeHtml(m.modelName || t('freeqa.ai', 'AI')) + '</span></div>'
        + '<div class="fq-answer" id="fqAnswer' + i + '" style="background:var(--bg-tertiary);border:1px solid var(--border);border-radius:2px 12px 12px 12px;padding:12px 14px;font-size:14px;color:var(--text-primary);word-break:break-word;">'
        + fqRenderMarkdown(m.text);
      if (m.sources && m.sources.length) {
        html += '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--border);font-size:11px;color:var(--text-secondary);line-height:1.9;">'
          + '🌐 ' + escapeHtml(_fqIsEn() ? 'Sources' : '参考来源') + '：';
        for (var s = 0; s < m.sources.length; s++) {
          var src = m.sources[s] || {};
          var su = safeUrl(src.url || '');
          html += '<div>' + (s + 1) + '. '
            + (su ? '<a href="' + su + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(src.title || su) + '</a>'
                  : escapeHtml(src.title || ''))
            + (src.source ? ' <span style="opacity:.7;">· ' + escapeHtml(src.source) + '</span>' : '') + '</div>';
        }
        html += '</div>';
      }
      html += '</div>'
        + '<div style="display:flex;gap:6px;margin-top:6px;">'
        + '<button class="btn btn-outline btn-sm" onclick="fqCopyAnswer(' + i + ')">📋 ' + escapeHtml(t('freeqa.copy', '复制')) + '</button>'
        + '<button class="btn btn-outline btn-sm" onclick="fqExportOne(' + i + ')">⬇ ' + escapeHtml(t('freeqa.export', '导出')) + '</button>'
        + '</div></div>';
    }
  }
  return html;
}

// 把口语化的问句压成检索关键词。整句丢给搜索引擎会翻车：
// "最近人工智能领域有什么新闻？请引用来源编号。" 实测命中的是「最近」的百度词条和李圣杰的歌，
// 而只搜 "人工智能 新闻" 就能拿到真的时事。所以剥掉指令句、疑问词和标点。
function _fqSearchQuery(q) {
  var s = String(q || '')
    .replace(/[，。！？；：、"“”‘’（）()\[\]【】…]+/g, ' ')
    .replace(/[,.!?;:"']+/g, ' ')
    // 指令性从句对检索没有帮助，反而挤掉了真正的主题词
    .replace(/请?(引用|标注|注明|列出|给出)[^ ]*/g, ' ')
    .replace(/(用|按)[^ ]{0,6}(格式|语言|风格)[^ ]*/g, ' ')
    .replace(/(有什么|是什么|怎么样|怎么办|如何|为什么|哪些|多少|吗|呢|嘛)/g, ' ')
    .replace(/\b(what|which|how|why|when|where|who|is|are|the|a|an|of|in|on|please|tell|me|about)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // 剥太狠就退回原句 —— 宁可搜得糙一点，也不能搜个空串
  return s.length >= 2 ? s.slice(0, 80) : String(q || '').slice(0, 80);
}

// ---- 发送 ----
async function fqSend() {
  if (fqSending) return;
  var input = document.getElementById('fqInput');
  var question = input ? input.value.trim() : '';
  var images = fqPendingImages.slice();
  if (!question && !images.length) {
    showToast(_fqIsEn() ? '⚠️ Type a question first' : '⚠️ 请先输入问题');
    if (input) input.focus();
    return;
  }
  if (!question) question = _fqIsEn() ? 'What is in this image?' : '请描述并分析这张图片。';

  var wantSearch = !!(document.getElementById('fqWebSearch') || {}).checked;

  fqSending = true;
  _fqSetBusy(true);
  if (input) input.value = '';
  fqPendingImages = [];
  fqRenderImageBar();
  fqHistory.push({ role: 'user', text: question, images: images, searched: wantSearch, ts: Date.now() });
  fqRenderChat();

  var sources = [];
  try {
    // ---- 联网检索：先搜再答，检索结果进 system prompt ----
    if (wantSearch) {
      var box0 = document.getElementById('fqChatBox');
      if (box0) {
        // 单独提示"正在检索"，否则用户会以为卡住了（检索 + 生成加起来可能 5s+）。
        // 倒序展示后要插在**最前面**（afterbegin）并滚到顶：beforeend 会把提示挂到
        // 最早那一轮的下面，用户在顶部完全看不见。
        box0.insertAdjacentHTML('afterbegin', '<div id="fqSearchTip" style="font-size:12px;color:var(--text-secondary);padding:4px 0;">🌐 '
          + escapeHtml(t('freeqa.searching', '正在联网检索…')) + '</div>');
        box0.scrollTop = 0;
      }
      try {
        var sr = await fetch('/api/web_search?q=' + encodeURIComponent(_fqSearchQuery(question)) + '&count=8');
        if (sr.ok) {
          var sj = await sr.json();
          var rs = (sj && sj.results) || [];
          for (var i = 0; i < rs.length && sources.length < 5; i++) {
            if (!rs[i] || !(rs[i].title || rs[i].snippet)) continue;
            sources.push({ title: rs[i].title || '', snippet: rs[i].snippet || rs[i].summary || '',
                           source: rs[i].source || '', url: rs[i].url || '' });
          }
        }
      } catch (se) { console.warn('[freeqa] web_search 失败:', se && se.message); }
      var tip = document.getElementById('fqSearchTip');
      if (tip) tip.remove();
      if (!sources.length) showToast(_fqIsEn() ? '⚠️ No search results, answering from model knowledge' : '⚠️ 未检索到结果，将直接由模型作答');
    }

    var messages = _fqBuildMessages(sources);
    var res = await callModuleChat('freeqa', messages);
    fqHistory.push({
      role: 'assistant', text: res.text, sources: sources,
      modelName: modelNameById(res.modelId) || res.modelId, ts: Date.now()
    });
  } catch (e) {
    console.error('[freeqa] 生成失败:', e);
    fqHistory.push({
      role: 'assistant',
      text: (_fqIsEn() ? '⚠️ Request failed: ' : '⚠️ 生成失败：') + (e && e.message ? e.message : 'unknown error')
        + (_fqIsEn() ? '\n\nTry again, or switch model above.' : '\n\n可以重试，或在上方切换其它模型。'),
      sources: [], modelName: _fqIsEn() ? 'error' : '错误', isError: true, ts: Date.now()
    });
  } finally {
    fqSending = false;
    _fqSetBusy(false);
    fqRenderChat();
    persistWorkspaceSoon();
  }
}

// 组装发给模型的 messages：system + 最近 N 轮 + 本轮（图片只挂在最后一条 user 上）
function _fqBuildMessages(sources) {
  // 原来这里分 _fqIsEn() 英/中两支，英文那支已删 —— setLang() 硬编码 'zh'，
  // 那条分支永远走不到，留着只会让人以为还有英文版要维护。
  // 立场写清"国内电商 + 国内自媒体"很重要：不写的话问"怎么做投放"时，
  // 模型会往 Facebook Ads / Google Ads 那边答，而不是千川和星图。
  var sys = '你是一位知识面广、回答务实的助手，服务于一支国内电商与自媒体运营团队。'
      + '回答要直接、具体、可执行，用 Markdown（小标题、加粗、列表）组织内容，便于快速浏览。'
      + '涉及平台、投放、大促节点时，默认用国内语境（抖音 / 小红书 / 视频号 / 千川 / 星图 / 618 / 双十一 / 私域），不要用海外平台举例。'
      + '如果用户上传了图片，先说明你实际看到了什么，再展开分析。全程用简体中文回答。';

  if (sources && sources.length) {
    var ref = _fqIsEn()
      ? '\n\nBelow are live web search results for the user\'s question. Ground your answer in them and cite by number like [1]. '
        + 'If they are irrelevant or insufficient, say so instead of forcing them in.\n'
      : '\n\n以下是针对用户问题的实时联网检索结果。请基于它们作答，并用 [1] [2] 这样的编号标注引用。'
        + '如果检索结果与问题无关或不足以回答，直接说明，不要硬套。\n';
    for (var i = 0; i < sources.length; i++) {
      ref += '\n[' + (i + 1) + '] ' + (sources[i].title || '')
        + (sources[i].source ? ' （来源：' + sources[i].source + '）' : '')
        + (sources[i].url ? '\n    ' + sources[i].url : '')
        + (sources[i].snippet ? '\n    ' + sources[i].snippet : '');
    }
    sys += ref;
  }

  var messages = [{ role: 'system', content: sys }];
  // 取最近 FQ_MAX_TURNS 轮：一轮两条，所以留 2*N 条；最后一条是刚 push 的本轮 user
  var start = Math.max(0, fqHistory.length - FQ_MAX_TURNS * 2);
  for (var k = start; k < fqHistory.length; k++) {
    var m = fqHistory[k];
    if (m.isError) continue;                       // 失败的回答不进上下文，否则模型会跟着道歉
    var isLast = (k === fqHistory.length - 1);
    if (m.role === 'user' && isLast && m.images && m.images.length) {
      var parts = [{ type: 'text', text: m.text }];
      for (var g = 0; g < m.images.length; g++) {
        if (/^data:image\//.test(m.images[g])) parts.push({ type: 'image_url', image_url: { url: m.images[g] } });
      }
      messages.push({ role: 'user', content: parts });
    } else {
      // 历史里的图片只留一句说明（见文件头 ② 的理由）
      var txt = m.text;
      if (m.role === 'user' && m.images && m.images.length && !isLast) {
        txt = '[' + (_fqIsEn() ? 'sent ' + m.images.length + ' image(s)' : '附带了 ' + m.images.length + ' 张图片') + '] ' + txt;
      }
      messages.push({ role: m.role, content: txt });
    }
  }
  return messages;
}

function _fqSetBusy(busy) {
  var btn = document.getElementById('btnFqSend');
  if (btn) btn.disabled = !!busy;
  var lbl = document.getElementById('btnFqSendLabel');
  if (lbl) lbl.textContent = busy ? t('freeqa.sending', 'AI 正在思考…') : t('freeqa.send', '发送');
}

// ---- 复制（富文本）----
// 复用 copySourcingTable 那套 ClipboardItem 双格式方案：Word / 飞书取 text/html 保留
// 小标题和加粗，纯文本编辑器取 text/plain。只 writeText 的话格式会全丢。
function fqCopyAnswer(i) {
  var m = fqHistory[i];
  if (!m) return;
  var node = document.getElementById('fqAnswer' + i);
  // 内联字体栈：粘进 Word 后不带字体声明会退成 Word 默认字体，
  // 和项目里"英文 Calibri / 中文宋体"的既有约定不一致。
  var html = '<div style="font-family:Calibri,\'Segoe UI\',SimSun,serif;font-size:11pt;line-height:1.75;">'
    + (node ? node.innerHTML : fqRenderMarkdown(m.text)) + '</div>';
  var text = node ? node.innerText : m.text;
  function done() { showToast(_fqIsEn() ? '✅ Copied with formatting' : '✅ 已复制（保留格式，可粘进 Word / 飞书）'); }
  function fail() { showToast(_fqIsEn() ? '⚠️ Copy failed' : '⚠️ 复制失败'); }
  if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
    try {
      var item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      });
      navigator.clipboard.write([item]).then(done).catch(function() { _copyRichFallback(html, text, done, fail); });
      return;
    } catch (e) {}
  }
  _copyRichFallback(html, text, done, fail);
}

// ---- 导出 ----
function _fqDownloadHtml(bodyHtml, filenameStem) {
  var full = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<title>' + escapeHtml(filenameStem) + '</title>'
    + '<style>body{font-family:Calibri,"Segoe UI",SimSun,serif;font-size:11pt;line-height:1.75;'
    + 'max-width:780px;margin:36px auto;padding:0 20px;color:#1a1a1a;}'
    + 'h3,h4{margin:18px 0 8px;}pre{background:#f5f5f5;padding:10px 12px;border-radius:6px;overflow-x:auto;}'
    + 'code{background:#f0f0f0;padding:1px 5px;border-radius:4px;}'
    + '.q{background:#eef2ff;border-left:3px solid #4f46e5;padding:8px 12px;margin:22px 0 8px;}'
    + '.meta{color:#888;font-size:9pt;}blockquote{border-left:3px solid #ddd;margin:6px 0;padding-left:10px;color:#666;}'
    + '</style></head><body>' + bodyHtml + '</body></html>';
  var url = URL.createObjectURL(new Blob([full], { type: 'text/html;charset=utf-8' }));
  var a = document.createElement('a');
  a.href = url;
  a.download = filenameStem + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(_fqIsEn() ? '✅ Exported .html' : '✅ 已导出 .html');
}

function fqExportOne(i) {
  var m = fqHistory[i];
  if (!m) return;
  var node = document.getElementById('fqAnswer' + i);
  // 把提问一起带上：单独一段回答脱离问题后往往看不懂
  var q = (i > 0 && fqHistory[i - 1] && fqHistory[i - 1].role === 'user') ? fqHistory[i - 1].text : '';
  var body = (q ? '<div class="q"><strong>Q：</strong>' + escapeHtml(q).replace(/\n/g, '<br>') + '</div>' : '')
    + (node ? node.innerHTML : fqRenderMarkdown(m.text));
  _fqDownloadHtml(body, 'freeqa_' + new Date().toISOString().slice(0, 10));
}

function fqExportAll() {
  if (!fqHistory.length) { showToast(_fqIsEn() ? 'Nothing to export' : '暂无内容可导出'); return; }
  // 导出刻意保持**正序**（最早在前）：屏幕上倒序是为了"一眼看到最新回答"，
  // 而导出的文档是拿去读/存档的，从头读下来才连贯。两者目的不同，不必一致。
  var body = '<h2>' + escapeHtml(t('freeqa.chat_title', '对话记录')) + '</h2>'
    + '<div class="meta">' + escapeHtml(new Date().toLocaleString()) + '</div>';
  for (var i = 0; i < fqHistory.length; i++) {
    var m = fqHistory[i];
    if (m.role === 'user') {
      body += '<div class="q"><strong>Q：</strong>' + escapeHtml(m.text).replace(/\n/g, '<br>')
        + (m.images && m.images.length ? '<div class="meta">🖼 ' + m.images.length + ' image(s)</div>' : '') + '</div>';
    } else {
      var node = document.getElementById('fqAnswer' + i);
      body += '<div>' + (node ? node.innerHTML : fqRenderMarkdown(m.text)) + '</div>';
      if (m.sources && m.sources.length) {
        body += '<div class="meta">Sources: ';
        for (var s = 0; s < m.sources.length; s++) {
          var su = safeUrl(m.sources[s].url || '');
          body += (s ? ' · ' : '') + '[' + (s + 1) + '] '
            + (su ? '<a href="' + su + '">' + escapeHtml(m.sources[s].title || su) + '</a>' : escapeHtml(m.sources[s].title || ''));
        }
        body += '</div>';
      }
    }
  }
  _fqDownloadHtml(body, 'freeqa_chat_' + new Date().toISOString().slice(0, 10));
}

function fqClear() {
  if (!fqHistory.length) return;
  if (!confirm(_fqIsEn() ? 'Clear the whole conversation?' : '确定清空整个对话吗？清空后无法恢复。')) return;
  fqHistory = [];
  fqPendingImages = [];
  fqRenderImageBar();
  fqRenderChat();
  persistWorkspaceSoon();      // 不落盘的话刷新后旧对话会从快照复活
  showToast(_fqIsEn() ? '✅ Conversation cleared' : '✅ 对话已清空');
}

// Enter 发送 / Shift+Enter 换行（对话框的通用习惯，placeholder 里也这么写了）。
// 中文输入法组字期间的 Enter 是"确认候选词"，isComposing 为 true，此时绝不能发送。
function _fqBindInput() {
  var input = document.getElementById('fqInput');
  if (!input || input._fqBound) return;
  input._fqBound = true;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      fqSend();
    }
  });
  // 整张输入卡都是落点，单轮可以拖多张（上限由 fqAddImageFiles 里的 FQ_MAX_IMAGES 兜）
  bindImageDropZone(document.getElementById('fqDropZone'), fqAddImageFiles, { multiple: true });

  // 粘贴图片：截图后 Ctrl+V 是比"存盘再拖"更快的路径，占位文案也承诺了。
  // 只在真的取到图片时才 preventDefault，否则会把普通文本粘贴一并吞掉。
  input.addEventListener('paste', function(e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type || '')) {
        var f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (!files.length) return;      // 纯文本粘贴，放行
    e.preventDefault();
    fqAddImageFiles(files);
  });

  fqRenderChat();
}

// 另外两处上传口（图片创作参考图 / 视频创作参考图）也补上拖拽。
// 它们都是单图语义，所以只取第一张，落地逻辑与点击选文件完全共用。
function _bindRefImageDropZones() {
  bindImageDropZone(document.getElementById('imageUploadArea'), function(files) {
    _applyRefImageFile(files[0]);
  });
  bindImageDropZone(document.getElementById('vcRefDropzone'), function(files) {
    _vcApplyRefFile(files[0]);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _fqBindInput);
  document.addEventListener('DOMContentLoaded', _bindRefImageDropZones);
} else {
  _fqBindInput();
  _bindRefImageDropZones();
}

// ============ 文案创作 · 内置 10 条国内自媒体 / 电商运营提示词 ============
// 每条都对着一个**真实存在的运营动作**写，而不是"帮我写篇文案"这种泛需求：
// 用户点进来大多不知道该怎么向模型描述任务，chip 的作用是先给一份及格的 brief 模板，
// 用户在这个基础上改比从空白框开始快得多。
//
// 挑选依据是国内各平台真正吃流量的内容形态：
//   小红书 → 第一人称真实体验笔记（平台明确给"真实使用过程"加权）
//   抖音/快手 → 前 3 秒钩子 + 口播节奏（完播率决定推流）
//   视频号 → 私域转化、客单价更高、人群偏年长
//   B站 → 中长视频、要讲透、观众反感"标题党"
//   公众号 → 私域沉淀、长文、看完转发
//   知乎 → 专业背书、长尾搜索流量
//   微博 → 热点借势、舆论场
//   淘宝天猫详情 → 卖点前置、搜索关键词覆盖
// 都写成中文 seed prompt：这是给中文模型的输入，中文 brief 的意图保真度更高，
// 翻译成英文再让模型回译成中文只会丢细节。
var TS_STARTER_PROMPTS = [
  { label: '📕 小红书种草笔记', prompt: '帮我写一篇小红书种草笔记，主题是【填入你的商品/主题】。要求：第一人称真实体验口吻，标题 ≤20 字带一个具体数字或场景；正文分 3 段，第一段说我原来的困扰，第二段说用了之后的具体变化（落到型号、价格带、使用了多久），第三段给购买建议和适合谁；结尾 5 个精准话题标签。不要通篇堆卖点，不要用"最""第一""绝对"这类绝对化用词。' },
  { label: '🎬 抖音带货口播脚本', prompt: '写一条 45 秒的抖音带货口播脚本，商品是【填入你的商品】。要求：前 3 秒必须是一个能让人停下来的钩子（反常识说法或直接抛痛点），中间用 3 个短句讲清"凭什么买它"（每句一个卖点 + 一个可感知的证据），最后 5 秒给下单理由和引导。按 [00:00-00:XX] 分段标注口播、画面、字幕，末尾附拍摄与剪辑节奏建议。语气要像真人聊天，不要念广告稿。' },
  { label: '🛒 商品详情页卖点文案', prompt: '为【填入你的商品】写淘宝/天猫详情页文案：1 个 ≤30 字主标题（把最强卖点和核心搜索词放最前面）、5 条卖点短句（每条以用户能感知的好处开头，不要只写参数）、3 段详情描述（分别讲使用场景、材质工艺、售后保障）。同时给 10 个买家会搜的关键词。避免绝对化用词和无法验证的功效承诺。' },
  { label: '🔥 微博热点借势文案', prompt: '结合当下【填入热点话题】写 3 条微博文案，把我们的【填入商品/品牌】自然带进去。每条 ≤140 字，各用不同角度（一条讲观点、一条讲自身经历、一条讲实用建议），要有可讨论性能引发评论，不要堆话题标签，不要硬广口吻。每条末尾给 1-2 个话题词。' },
  { label: '📨 公众号私域推文', prompt: '写一篇微信公众号推文，主题是【填入你的主题】，面向已经关注我们的老用户。要求：标题给 3 个备选（各 ≤22 字，不要标题党）；正文 800-1200 字，开头用一个具体的用户故事或场景切入，中间讲清一件事的来龙去脉并给出可执行建议，结尾一个软性引导（进群/看往期/留言）。分小标题，段落短，适合手机上读。另附一条 40 字以内的朋友圈转发语。' },
  { label: '💡 知乎专业长回答', prompt: '以从业者视角回答知乎问题【填入问题】，顺带建立我们【填入品类】的专业口碑。要求：开头先给结论，再分 3-4 个小标题展开论证，每个论点配一个具体数据、行业常识或亲历案例；主动指出常见的错误认知和挑选时容易踩的坑；全文 1000 字左右，克制、不吹，只在最后一段自然提及我们的解决方案。' },
  { label: '📺 B站中视频脚本', prompt: '写一个 5-8 分钟的 B 站中视频脚本，选题是【填入你的选题】。要求：开头 30 秒讲清"看完你能得到什么"，中间分 3 个章节层层递进（每章一个小结论），过程中安排 2 处适合放梗/弹幕互动的点，结尾做总结并引导三连。按章节给出口播文稿、画面/素材需求、屏幕文字。语气专业但不端着，不要说教。' },
  { label: '🤝 达人合作脚本（素人视角）', prompt: '为一位 5000-2 万粉的素人达人写 30 秒短视频脚本，推荐【填入你的商品】。要求：第一人称、手持自拍质感，像随手分享而不是接了广告；说清她是在什么场景下开始用的、原来用什么、换了之后哪里不一样；必须包含一句真实的"这点我不太满意"以建立可信度；结尾说清在哪买。不要出现任何绝对化用词。' },
  { label: '🎁 大促活动文案（618/双11）', prompt: '为【填入大促节点，如 618 / 双11 / 年货节】写一组活动文案，商品是【填入你的商品】。要求：1 条预热期悬念文案、1 条开门红当天的紧迫感文案、1 条返场期的补量文案；每条都要说清优惠机制（到手价/满减/赠品）并给出明确行动指令。另附 3 条社群/朋友圈短文案（各 ≤50 字）。价格用人民币，机制要写得让人一眼看懂，不要绕。' },
  { label: '🧪 多版本测款文案', prompt: '我要给【填入你的商品】测 5 个不同的内容方向再决定放量。请给 5 条文案，每条 ≤60 字，分别对应 5 个不同的切入角度（价格/痛点/人群/场景/对比），钩子和主打卖点都不能重复，方便我按数据判断哪个角度跑得出来。每条后面用一句话说明这条测的是什么假设。' }
];

function tsRenderChips() {
  var row = document.getElementById('tsChipRow');
  if (!row) return;
  var html = '';
  for (var i = 0; i < TS_STARTER_PROMPTS.length; i++) {
    html += '<button class="chip" onclick="tsFillPrompt(' + i + ')">' + escapeHtml(TS_STARTER_PROMPTS[i].label) + '</button>';
  }
  row.innerHTML = html;
}

function tsFillPrompt(idx) {
  var input = document.getElementById('tsPromptInput');
  if (!input) return;
  var seed = TS_STARTER_PROMPTS[idx];
  if (!seed) return;
  input.value = seed.prompt;
  input.focus();
  showToast('✅ 已填入提示词，把【】里的内容换成你的商品再生成');
}

// ============ 热点发现 · 内置领域关键词（10 个，面向国内电商 + 国内自媒体） ============
// 为什么要内置：搜索框是自由输入，用户打「AI」这类泛词，Bing 返回的是通用科技新闻，
// 和电商/自媒体运营半点关系没有 —— 这正是"搜出来的东西跟我要的不搭"的来源之一。
// 内置词都带**领域限定语**（"电商选品" 而非 "选品"、"抖音电商" 而非 "抖音"），
// 实测能把结果拉回本行业。
//
// 两个搜索源现在共用这一套中文词：全网搜索走 Bing/百度，资讯聚合走模型，
// 两条链路都吃中文（不再有"英文语料源"那一档，所以不用再分两套）。
//
// ⚠️ 这 10 个 q 值全部是**逐个实测过 /api/web_search 有真实结果**的原词，别随手加限定词：
//   电商选品 7 条 / 爆款拆解 4 条 / 抖音电商 6 条 / 电商平台新规 10 条 /
//   内容营销 种草 9 条 / 电商大促 复盘 6 条 / 达人合作 电商运营 5 条 /
//   私域运营 7 条 / 营销方案 6 条 / 直播带货 运营 8 条
// Bing 是 AND 语义，多加一个词就多一个必须同时命中的约束 —— "电商选品" 能出 7 条，
// 改成"电商选品 趋势"就可能归零。改动任何一个 q 之后都要重新实测，不能凭感觉调。
// （Bing 对同一 IP 高频请求会短暂限流返回 0 条，间隔几秒后恢复；机房 IP 还可能整段
//   连不上（SSL EOF）。此时后端会返回 engines_down=true 并如实提示，不是这些词失效了。）
var HOTSPOT_KEYWORDS = [
  { label: '电商选品',   q: '电商选品' },
  { label: '爆款商品',   q: '抖音电商' },
  { label: '爆款拆解',   q: '爆款拆解' },
  { label: '直播带货',   q: '直播带货 运营' },
  { label: '达人合作',   q: '达人合作 电商运营' },
  { label: '内容种草',   q: '内容营销 种草' },
  { label: '营销方案',   q: '营销方案' },
  { label: '平台新规',   q: '电商平台新规' },
  { label: '私域运营',   q: '私域运营' },
  { label: '大促复盘',   q: '电商大促 复盘' }
];

function renderHotspotKwChips() {
  var row = document.getElementById('hotspotKwChips');
  if (!row) return;
  var html = '';
  for (var i = 0; i < HOTSPOT_KEYWORDS.length; i++) {
    var k = HOTSPOT_KEYWORDS[i];
    // title 里放真正会被搜的词：内置词做了领域限定（"电商选品" 而非 "选品"），
    // 用户悬停就知道点下去搜的是什么，不会以为按钮和标签不一致是 bug。
    html += '<button class="chip" style="font-size:12px;padding:4px 10px;"'
      + ' onclick="useHotspotKeyword(' + i + ')"'
      + ' title="' + escapeAttr('搜索：' + k.q) + '">'
      + escapeHtml(k.label) + '</button>';
  }
  row.innerHTML = html;
}

// 点内置关键词：填进搜索框并立即搜
function useHotspotKeyword(idx) {
  var k = HOTSPOT_KEYWORDS[idx];
  if (!k) return;
  var input = document.getElementById('searchInput');
  if (!input) return;
  input.value = k.q;
  if (typeof searchWebHotspots === 'function') searchWebHotspots();
}

// ============ 语音输入（Web Speech API 听写） ============
// 用浏览器原生 SpeechRecognition，不上传音频到本站后端：
//   - 不用给服务器加音频落盘/转码链路，也不用为音频做鉴权和清理
//   - 少一份用户语音数据留在我们盘上（隐私面越小越好）
// 代价是只有 Chrome / Edge / Safari 支持（Chromium 系会把音频送到 Google 的
// 识别服务，这点必须让用户知道 —— 见 ts.voice.privacy 提示）。
// Firefox 完全不支持 → 按钮直接隐藏，而不是留个点了报错的按钮。
var _voiceRec = null;          // 当前 SpeechRecognition 实例
var _voiceTargetId = null;     // 正在听写的目标输入框 id
var _voiceBtnId = null;
var _voiceInterimId = null;
var _voiceBaseText = '';       // 开录那一刻框里已有的文字：识别结果追加在它后面，不覆盖用户已打的内容
var _voiceFinal = '';          // 本次会话累积的 final 段
var _voiceStopping = false;    // 用户主动停 vs 引擎自己断（后者要自动续录）

function voiceSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function toggleVoiceInput(targetId, btnId, interimId) {
  var isEn = (window.currentLang === 'en');
  if (!voiceSupported()) {
    showToast(isEn ? '⚠️ This browser does not support voice input — try Chrome or Edge'
                   : '⚠️ 当前浏览器不支持语音输入，请用 Chrome 或 Edge');
    return;
  }
  // 已经在录同一个框 → 停；在录别的框 → 先停掉那个再开这个
  if (_voiceRec) {
    var wasSame = (_voiceTargetId === targetId);
    stopVoiceInput();
    if (wasSame) return;
  }
  startVoiceInput(targetId, btnId, interimId);
}

function startVoiceInput(targetId, btnId, interimId) {
  var el = document.getElementById(targetId);
  if (!el) return;
  var isEn = (window.currentLang === 'en');
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;

  try {
    _voiceRec = new Rec();
  } catch (e) {
    showToast(isEn ? '⚠️ Could not start voice input' : '⚠️ 语音输入启动失败');
    _voiceRec = null;
    return;
  }

  _voiceTargetId = targetId;
  _voiceBtnId = btnId;
  _voiceInterimId = interimId;
  _voiceBaseText = el.value || '';
  _voiceFinal = '';
  _voiceStopping = false;

  // 识别语种跟界面语言走：中文界面按中文说、英文界面按英文说，
  // 这是绝大多数人的实际用法。跟着 currentLang 而不是写死 zh-CN，
  // 否则英文用户说英文会被强行按中文音节转写成一串乱码汉字。
  _voiceRec.lang = isEn ? 'en-US' : 'zh-CN';
  _voiceRec.continuous = true;      // 长句/多句连说，不要说一句就断
  _voiceRec.interimResults = true;  // 出实时预览，用户能马上发现识别跑偏

  _voiceRec.onresult = function(ev) {
    var interim = '';
    for (var i = ev.resultIndex; i < ev.results.length; i++) {
      var txt = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) {
        // 段与段之间要不要补空格，看两侧字符：英文单词粘在一起就成了
        // "the sellingpointsfor" 这种废话，中文补空格反而多出难看的断口。
        // Chrome 有时自带前导空格，所以先看两侧是否已经有空白。
        var needSp = _voiceFinal && !/\s$/.test(_voiceFinal) && !/^\s/.test(txt)
                     && /[A-Za-z0-9]$/.test(_voiceFinal) && /^[A-Za-z0-9]/.test(txt);
        _voiceFinal += (needSp ? ' ' : '') + txt;
      } else interim += txt;
    }
    var target = document.getElementById(_voiceTargetId);
    if (target) {
      // base + final：interim 只进预览区，不写进框。
      // 直接把 interim 写进 textarea 会让文字疯狂闪烁重写，
      // 用户想中途手动改一个字都做不到（每次 onresult 都被覆盖）。
      var joiner = (_voiceBaseText && !/\s$/.test(_voiceBaseText)) ? ' ' : '';
      target.value = _voiceBaseText + (_voiceFinal ? joiner + _voiceFinal : '');
    }
    var box = document.getElementById(_voiceInterimId);
    if (box) {
      if (interim) {
        box.textContent = (isEn ? '🎙 Listening: ' : '🎙 正在识别：') + interim;
        box.style.display = 'block';
      } else {
        box.style.display = 'none';
      }
    }
  };

  _voiceRec.onerror = function(ev) {
    var code = ev && ev.error;
    console.warn('[Voice] error:', code);
    // no-speech 是"这几秒没听到人说话"，continuous 模式下很常见，不该弹错误打扰用户
    if (code === 'no-speech' || code === 'aborted') return;
    var msg;
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      msg = isEn ? '⚠️ Microphone blocked — allow mic access in the address-bar icon, then try again'
                 : '⚠️ 麦克风被拒绝 —— 请点地址栏的权限图标允许麦克风后重试';
    } else if (code === 'audio-capture') {
      msg = isEn ? '⚠️ No microphone found' : '⚠️ 没有检测到麦克风设备';
    } else if (code === 'network') {
      msg = isEn ? '⚠️ Speech service unreachable (recognition runs in the cloud)'
                 : '⚠️ 语音识别服务不可达（浏览器的识别走云端，需要联网）';
    } else {
      msg = (isEn ? '⚠️ Voice input error: ' : '⚠️ 语音输入出错：') + code;
    }
    showToast(msg);
    _voiceStopping = true;   // 真错误就别自动续录，否则会反复弹同一个提示
  };

  _voiceRec.onend = function() {
    // continuous=true 也可能被引擎在长静默后主动断开。
    // 不是用户点的停，就自动续上 —— 否则用户中间思考十几秒回来接着说，
    // 会发现已经不录了，而按钮看上去还是红的。
    if (!_voiceStopping && _voiceRec) {
      try { _voiceRec.start(); return; } catch (e) { /* 续录失败就走正常收尾 */ }
    }
    _finishVoiceInput();
  };

  try {
    _voiceRec.start();
  } catch (e) {
    showToast(isEn ? '⚠️ Could not start voice input' : '⚠️ 语音输入启动失败');
    _voiceRec = null;
    return;
  }

  var btn = document.getElementById(btnId);
  if (btn) {
    btn.classList.add('recording');
    var lab = btn.querySelector('[data-i18n]');
    if (lab) lab.textContent = isEn ? 'Stop & insert' : '停止并插入';
  }
  showToast(isEn ? '🎙 Listening — click again to stop' : '🎙 正在录音，再点一次结束');
}

function stopVoiceInput() {
  if (!_voiceRec) return;
  _voiceStopping = true;
  try { _voiceRec.stop(); } catch (e) { _finishVoiceInput(); }
}

function _finishVoiceInput() {
  var isEn = (window.currentLang === 'en');
  var btn = document.getElementById(_voiceBtnId);
  if (btn) {
    btn.classList.remove('recording');
    var lab = btn.querySelector('[data-i18n]');
    if (lab && typeof t === 'function') lab.textContent = t('ts.btn.voice', isEn ? 'Voice input' : '语音输入');
  }
  var box = document.getElementById(_voiceInterimId);
  if (box) { box.textContent = ''; box.style.display = 'none'; }

  var target = document.getElementById(_voiceTargetId);
  if (target && _voiceFinal.trim()) {
    // 听写完的内容要进工作区快照，否则刷新就丢 —— 用户说了两分钟的东西不能因为
    // 没触发 input 事件（value 是 JS 改的，不冒泡 input）而不落盘。
    if (typeof persistWorkspaceSoon === 'function') persistWorkspaceSoon();
    showToast((isEn ? '✅ Inserted ' : '✅ 已插入 ') + _voiceFinal.trim().length + (isEn ? ' characters' : ' 个字符'));
  }
  _voiceRec = null;
  _voiceFinal = '';
  _voiceBaseText = '';
  _voiceStopping = false;
}

// 不支持的浏览器（主要是 Firefox）直接隐藏按钮：留一个点了必报错的按钮
// 比没有按钮更糟 —— 用户会以为是站点坏了。
// 两个方向都要写：这个函数会被 applyI18n 反复调用，只写单向会让它变成
// 不可逆操作（一旦隐藏过就再也回不来），排查时极难看出是谁隐藏的。
function initVoiceButtons() {
  var show = voiceSupported() ? '' : 'none';
  var btns = document.querySelectorAll('.voice-btn');
  for (var i = 0; i < btns.length; i++) btns[i].style.display = show;
}

// 离开页面/切走时收尾：麦克风一直开着是隐私问题，而且用户不会想到"是刚才那个页面还在录"
window.addEventListener('beforeunload', function() { if (_voiceRec) { _voiceStopping = true; try { _voiceRec.abort(); } catch (e) {} } });

// ============ 选品 · 内置关键词 + 分析链路 ============
// 10 个内置词的选法有讲究：全部是国内电商**内容带货友好**的品类
// （有视觉冲击 / 有痛点故事 / 有前后对比），而不是简单列"热门品类"。
// 刻意排除了两头：几元的纯低价白牌（投流费吃掉全部毛利）和上万元的大件
// （决策周期长、退货运费能把利润打穿），这两类靠短视频种草都不划算。
// q 全部写成中文，因为下游走的是 /api/web_search（Bing 新闻 + Bing 网页 + 百度），
// 中文词才有命中率；带上"销量 榜单 推荐 测评"这类词是为了打到榜单和测评页。
// 价格框留空 / 填了非数字 → null（这一头不限），而不是回落到某个写死的默认值。
// 写死默认值的老做法有个隐患：用户清空输入框以为"不限价"，实际被悄悄改回 60–300。
function _srcParsePrice(v) {
  var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
  if (!isFinite(n) || n < 0) return null;
  return n;
}
// 给人看的价格带描述
function _srcPriceLabel(lo, hi) {
  if (lo === null && hi === null) return '不限客单价';
  if (lo === null) return '¥' + hi + ' 以下';
  if (hi === null) return '¥' + lo + ' 以上';
  return '¥' + lo + '–¥' + hi;
}
// 给模型看的价格带硬约束
function _srcPriceRule(lo, hi) {
  if (lo === null && hi === null) return '本次不限客单价，但同一批候选品的价格带不要拉得太散（最贵的不超过最便宜的 10 倍），否则没法横向比较。';
  if (lo === null) return '客单价（aov）必须 ≤ ¥' + hi + '。超出的直接丢掉，不要为了凑数把区间放宽。';
  if (hi === null) return '客单价（aov）必须 ≥ ¥' + lo + '。低于这个价的直接丢掉，不要为了凑数把区间放宽。';
  return '客单价（aov）必须落在 ¥' + lo + '–¥' + hi + ' 之间。超出区间的直接丢掉，不要为了凑数把区间拉宽。';
}

var SOURCING_KEYWORDS = [
  { label: '智能宠物用品', q: '智能猫砂盆 宠物用品 销量榜 推荐 测评' },
  { label: '人体工学家居', q: '电动升降桌 人体工学椅 销量榜 推荐 测评' },
  { label: '户外露营装备', q: '露营装备 户外便携电源 销量榜 推荐 测评' },
  { label: '家用健身器材', q: '家用健身器材 划船机 哑铃 销量榜 推荐 测评' },
  { label: '厨房小家电',   q: '厨房小家电 空气炸锅 咖啡机 销量榜 推荐 测评' },
  { label: '美容个护仪器', q: '美容仪 家用脱毛仪 高速吹风机 销量榜 推荐 测评' },
  { label: '智能家居',     q: '智能家居 扫地机器人 智能门锁 销量榜 推荐 测评' },
  { label: '3C 数码配件',  q: '数码配件 充电宝 蓝牙耳机 销量榜 推荐 测评' },
  { label: '母婴用品',     q: '母婴用品 婴儿推车 儿童安全座椅 销量榜 推荐 测评' },
  { label: '车载用品',     q: '车载用品 行车记录仪 车载充电器 销量榜 推荐 测评' }
];

function renderSourcingKwChips() {
  var row = document.getElementById('sourcingKwChips');
  if (!row) return;
  var html = '';
  for (var i = 0; i < SOURCING_KEYWORDS.length; i++) {
    var k = SOURCING_KEYWORDS[i];
    html += '<button class="chip" style="font-size:12px;padding:4px 10px;"'
      + ' onclick="useSourcingKeyword(' + i + ')"'
      + ' title="' + escapeAttr('分析：' + k.q) + '">'
      + escapeHtml(k.label) + '</button>';
  }
  row.innerHTML = html;
}

function useSourcingKeyword(idx) {
  var k = SOURCING_KEYWORDS[idx];
  if (!k) return;
  var input = document.getElementById('srcKeywordInput');
  if (!input) return;
  input.value = k.q;
  runSourcing();
}

// 最近一次结果（供「复制表格」用）。刻意不进 workspace 快照：
// 这张表几十 KB，而且是一次性决策参考，用户重新分析一次比翻旧表更有价值。
var _sourcingRows = [];

// 本次 /api/web_search 真实抓到的链接集合。存它是为了给模型给出的 url 做**白名单校验**：
// 只有原封不动出现在这个集合里的链接才允许渲染成 <a>，其余一律当不存在。
var _sourcingRefUrls = [];

// 平台 → 搜索页 URL 前缀。用搜索页而不是详情页，是这个 Bug 的核心修法：
// 详情页地址里带商品 ID，模型没有真实 ID 就只能编，编出来的必然是死链（用户报的
// "商品找不到"）；而搜索页只需要商品名，拼出来的链接**一定打得开、一定是这个平台上
// 真实在售的同款列表**。用户点开是为了核价核款，搜索结果页完全够用，比一个 404 强得多。
// 这些前缀都实测过 200（2026-08）。抖音是路径式搜索，所以前缀不带 ?。
var SRC_PLATFORM_SEARCH = [
  { key: '天猫',   url: 'https://list.tmall.com/search_product.htm?q=' },
  { key: '淘宝',   url: 'https://s.taobao.com/search?q=' },
  { key: '京东',   url: 'https://search.jd.com/Search?enc=utf-8&keyword=' },
  { key: '拼多多', url: 'https://mobile.yangkeduo.com/search_result.html?search_key=' },
  { key: '抖音',   url: 'https://www.douyin.com/search/' },
  { key: '快手',   url: 'https://www.kuaishou.com/search/video?searchKey=' },
  { key: '小红书', url: 'https://www.xiaohongshu.com/search_result?keyword=' },
  { key: '得物',   url: 'https://www.dewu.com/search?title=' },
  { key: '唯品会', url: 'https://category.vip.com/suggest.php?keyword=' },
  { key: '1688',   url: 'https://s.1688.com/selloffer/offer_search.htm?keywords=' }
];

// 按平台名拼一个搜同款链接。模型返回的 platform 不保证是枚举里的原词
// （实测会出现「淘宝/天猫」「京东自营」「抖音商城」这类变体），所以用**子串命中**
// 而不是全等查表。命中不了（含「品牌官网」）就回落百度 —— 百度一定搜得到，
// 而"品牌官网"没有统一的搜索页地址，硬猜一个反而又造死链。
function srcSearchUrl(platform, name) {
  var n = String(name == null ? '' : name).trim();
  // 括号里的限定语（「（带健康监测款）」「(2代)」）在平台搜索框里是噪声，
  // 常见结果是 0 命中 —— 链接能打开但页面空着，用户观感和死链差不多。
  // 去掉括号内容、压掉多余空格再拿去搜；商品主名足够定位到同款列表。
  n = n.replace(/[（(][^）)]*[）)]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return '';
  var p = String(platform == null ? '' : platform);
  for (var i = 0; i < SRC_PLATFORM_SEARCH.length; i++) {
    if (p.indexOf(SRC_PLATFORM_SEARCH[i].key) !== -1) {
      return SRC_PLATFORM_SEARCH[i].url + encodeURIComponent(n);
    }
  }
  return 'https://www.baidu.com/s?wd=' + encodeURIComponent(n);
}

// 模型给的 url 只有在本次抓取结果里真实出现过才认。
// 为什么要这么严：模型很擅长把参考链接"改写"成看起来更像详情页的样子
// （换个 host、补个商品 ID），改写后的地址点开就是 404 或者跳到不相干的商品，
// 正是用户看到的"打开不匹配"。做完全等比对是唯一能 100% 排除编造的办法。
function _srcVerifiedRef(url) {
  var s = String(url == null ? '' : url).trim();
  if (!s || s === 'N/A') return '';
  for (var i = 0; i < _sourcingRefUrls.length; i++) {
    if (_sourcingRefUrls[i] === s) return safeUrl(s);
  }
  return '';
}

async function runSourcing() {
  var input = document.getElementById('srcKeywordInput');
  if (!input) return;
  var kw = (input.value || '').trim();
  if (!kw) {
    showToast(window.currentLang === 'en' ? '⚠️ Enter a category or brand keyword first' : '⚠️ 请先输入品类或品牌关键词');
    input.focus();
    return;
  }

  // 价格带自定义：两头都允许留空。null 表示"这一头不限"，不再回落到写死的 60/300。
  var priceMin = _srcParsePrice((document.getElementById('srcPriceMin') || {}).value);
  var priceMax = _srcParsePrice((document.getElementById('srcPriceMax') || {}).value);
  // 上下限填反了就交换，不要硬拉成 min+1 —— 那会得到一个 ¥500–501 的荒唐区间，
  // 模型照着搜必然零命中，用户还以为是"这个品类没货"。
  if (priceMin !== null && priceMax !== null) {
    if (priceMax < priceMin) { var _sw = priceMin; priceMin = priceMax; priceMax = _sw; }
    if (priceMax === priceMin) priceMax = priceMin + 1;
  }
  var minRating = parseInt((document.getElementById('srcMinRating') || {}).value, 10) || 85;

  var isEn = (window.currentLang === 'en');
  var btn = document.getElementById('btnRunSourcing');
  var loading = document.getElementById('srcLoading');
  var loadingText = document.getElementById('srcLoadingText');
  var result = document.getElementById('srcResult');
  var empty = document.getElementById('srcEmpty');
  var copyBtn = document.getElementById('btnCopySourcing');

  var origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> '
      + (isEn ? 'Analyzing...' : '分析中...');
  }
  if (loading) loading.style.display = 'block';
  if (result) result.style.display = 'none';
  if (empty) empty.style.display = 'none';
  if (copyBtn) copyBtn.style.display = 'none';

  // 等待期间刷新提示文案 —— AI 常态 20 秒以上，静止的转圈会被当成卡死
  var ticks = 0;
  var timer = setInterval(function() {
    ticks++;
    if (loadingText) {
      loadingText.textContent = '正在挖掘「' + kw + '」的国内电商讨论与销量榜单（约 20–50 秒，已等待 ' + (ticks * 5) + ' 秒）...';
    }
  }, 5000);

  try {
    // ---- 第一段：真抓。拿到的是真实链接，这是整张表里唯一 100% 可核对的字段。 ----
    // 走 /api/web_search（Bing 新闻 + Bing 网页 + 百度）而不是海外那条腿：
    // 后者打的是 HN/Reddit/NewsAPI 三个纯英文语料源，中文品类词命中率天然为 0。
    var scraped = [];
    try {
      var osResp = await fetch('/api/web_search?q=' + encodeURIComponent(kw) + '&count=12');
      var osJson = await osResp.json();
      scraped = (osJson && osJson.results) || [];
    } catch (se) {
      console.warn('[Sourcing] /api/web_search failed:', se && se.message);
    }
    console.log('[Sourcing] scraped refs:', scraped.length);

    var refBlock = '';
    _sourcingRefUrls = [];
    for (var s = 0; s < scraped.length && s < 12; s++) {
      var _ru = scraped[s].url || scraped[s].sourceUrl || '';
      if (/^https?:\/\//i.test(_ru)) _sourcingRefUrls.push(_ru);
      refBlock += (s + 1) + '. ' + (scraped[s].title || '')
        + (scraped[s].snippet ? '\n   摘要：' + scraped[s].snippet : '')
        + '\n   链接：' + _ru + '\n';
    }
    if (!refBlock) refBlock = '（这次没抓到实时参考资料 —— 只用你自己的知识作答，url 字段一律填 N/A）\n';

    // ---- 第二段：结构化。硬约束"抓不到写 N/A"，这是本页最重要的一条规则：
    //      用户拿这张表做采购决策，一个编造的销量数字比一个 N/A 危险得多。 ----
    var priceRule = _srcPriceRule(priceMin, priceMax);
    var systemPrompt = '你是一位国内电商资深选品分析师，有 10 年以上经验，长期在淘宝天猫、京东、拼多多、抖音商城、快手小店、小红书商城、得物、1688 上挑爆款 SKU。\n\n'
      + '任务：给你一个品类或品牌关键词，外加一批刚抓到的实时网页参考，请挑出**真实存在、当前在国内平台在售**的候选品清单。\n\n'
      + '【硬性要求】\n'
      + '- 只返回一个 JSON 数组。不要 markdown 代码围栏，前后不要任何解释文字。\n'
      + '- 6 到 10 条。每一条都必须是今天在国内电商平台真实买得到的商品。\n'
      + '- ' + priceRule + '\n'
      + '- 只保留好评率 ≥ ' + minRating + '% 的商品。\n'
      + '- 【诚实原则，最重要】你拿不到真实销量和评价数。sales / aov / good / bad 四个字段一律给**明确标注为估算的区间**（例如「约 3千-8千/月」「¥299-399」「约 92%」）。任何一个字段你确实估不出来，就原样输出 "N/A"。绝对不要为了显得权威而编一个精确好看的数字 —— 编错的数字会让用户真金白银亏钱，一个 N/A 什么都不亏。\n'
      + '- url 字段：**只允许原样复制上面参考资料里的链接**，一个字符都不要改。参考资料里没有对得上这个商品的链接，就填 "N/A"。绝对不要自己拼一个详情页地址、不要把参考链接改写成看起来更像商品页的样子、不要凭空造商品 ID —— 编出来的链接点开是 404 或者是别的商品，用户核价时会被误导。平台搜索链接由程序自己拼，不需要你给。\n'
      + '- goodwhy / badwhy 要写具体的评价主题（例如「除臭效果好、App 配网简单」/「App 频繁掉线、替换滤芯太贵」），不要写空泛的夸奖。\n'
      + '- buyer 要同时点明人群和年龄段（例如「一线城市合租养猫女性，25-35，双职工家庭」）。\n'
      + '- 按商业吸引力从高到低排序。\n\n'
      + '每条的 JSON 字段（除商品名与 url 保留原文外，其余全部用简体中文）：\n'
      + '{"name":"商品名称","url":"参考资料里对得上的原始链接，没有就填 N/A","platform":"天猫|淘宝|京东|拼多多|抖音商城|快手小店|小红书商城|得物|唯品会|1688|品牌官网",'
      + '"sales":"近一个月销量估算区间","aov":"客单价区间（人民币，带 ¥）","feature":"它为什么卖得动",'
      + '"good":"好评率估算","bad":"差评率估算","goodwhy":"好评集中在哪些点","badwhy":"差评集中在哪些点","buyer":"人群 + 年龄段"}';

    var userPrompt = '关键词：' + kw + '\n'
      + '客单价筛选：' + _srcPriceLabel(priceMin, priceMax) + '\n'
      + '好评率下限：' + minRating + '%\n'
      + '时间窗口：近 30 天在国内平台走量 / 有热度的商品\n\n'
      + '刚刚抓到的实时网页参考（标题 + 摘要 + 链接，来自 Bing 与百度）：\n'
      + refBlock
      + '\n现在返回那个 JSON 数组。';

    var rawText = await callModuleText('sourcing', systemPrompt, userPrompt);
    var jsonStr = String(rawText || '').trim();
    if (jsonStr.indexOf('```') !== -1) {
      var m = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) jsonStr = m[1].trim();
    }
    var a0 = jsonStr.indexOf('['), a1 = jsonStr.lastIndexOf(']');
    if (a0 !== -1 && a1 > a0) jsonStr = jsonStr.substring(a0, a1 + 1);
    var items = JSON.parse(jsonStr);
    if (!Array.isArray(items)) throw new Error('Model did not return an array');

    _sourcingRows = items.filter(function(it) { return it && it.name; });
    clearInterval(timer);
    if (loading) loading.style.display = 'none';

    if (!_sourcingRows.length) {
      if (empty) {
        // 复位提示语：上一轮失败时这里被写过错误原因，不复位会把"分析失败"
        // 挂在一次成功但零命中的结果上，用户会以为模型又挂了
        var okHint = empty.querySelector('p:last-child');
        if (okHint && typeof t === 'function') okHint.textContent = t('src.empty.hint', okHint.textContent);
        empty.style.display = 'block';
      }
      return;
    }
    renderSourcingTable(kw, priceMin, priceMax, minRating, scraped.length);
    if (result) result.style.display = 'block';
    if (copyBtn) copyBtn.style.display = 'inline-flex';
    showToast((isEn ? '✅ ' : '✅ 已筛出 ') + _sourcingRows.length + (isEn ? ' candidates shortlisted' : ' 个候选品'));
  } catch (e) {
    clearInterval(timer);
    if (loading) loading.style.display = 'none';
    console.error('[Sourcing] failed:', e);
    if (empty) {
      empty.style.display = 'block';
      // 失败原因写进空态而不是只弹 toast：toast 一闪就没，用户会反复点按钮
      var hint = empty.querySelector('p:last-child');
      if (hint) {
        hint.textContent = (isEn ? 'Analysis failed: ' : '分析失败：')
          + ((e && e.message) || (isEn ? 'all text models unavailable' : '所有文本模型均不可用'))
          + (isEn ? ' — check 大模型配置, or retry in a moment.' : ' —— 请检查「大模型配置」里的模型可用性，或稍后重试。');
      }
    }
    showToast((isEn ? '⚠️ Sourcing analysis failed — ' : '⚠️ 选品分析失败 — ') + ((e && e.message) || 'unknown'));
  } finally {
    clearInterval(timer);
    if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
  }
}

function renderSourcingTable(kw, priceMin, priceMax, minRating, refCount) {
  var body = document.getElementById('sourcingBody');
  if (!body) return;
  var html = '';
  for (var i = 0; i < _sourcingRows.length; i++) {
    var r = _sourcingRows[i];
    var na = 'N/A';
    // ---- 链接列。原先这里直接把模型给的 r.url 渲染成 <a>，safeUrl 只校验协议头，
    //      所以一个编造的 https://item.jd.com/<假ID>.html 会渲染成一个点开 404 的链接
    //      —— 这就是用户报的"详情页链接打开不匹配或者商品找不到"。
    //      现在拆成两个来源，且都不可能是死链：
    //        ① 搜同款：程序按 platform + 商品名拼平台搜索页，一定打得开、一定是真实在售列表
    //        ② 来源：仅当 r.url 原封不动出现在本次真实抓取结果里才渲染（_srcVerifiedRef 全等比对）
    //      模型自己编的地址两条都进不来，静默丢弃。
    var searchHref = srcSearchUrl(r.platform, r.name);
    var linkCell = '<div style="display:flex;flex-direction:column;gap:3px;white-space:nowrap;">';
    linkCell += '<span style="font-size:12px;color:var(--text-secondary);">' + escapeHtml(r.platform || na) + '</span>';
    if (searchHref) {
      linkCell += '<a href="' + escapeAttr(searchHref) + '" target="_blank" rel="noopener noreferrer" '
        + 'title="在该平台搜索这个商品名（程序生成的搜索链接，不是详情页）" style="font-size:12px;">🔍 搜同款 ↗</a>';
    }
    var refHref = _srcVerifiedRef(r.url);
    if (refHref) {
      linkCell += '<a href="' + refHref + '" target="_blank" rel="noopener noreferrer" '
        + 'title="本次实时抓取到的参考网页（榜单/测评，不一定是商品详情页）" '
        + 'style="font-size:12px;color:var(--text-secondary);">📄 参考来源 ↗</a>';
    }
    linkCell += '</div>';
    html += '<tr>'
      + '<td style="text-align:center;color:var(--text-secondary);">' + (i + 1) + '</td>'
      + '<td style="font-weight:600;">' + escapeHtml(r.name || na) + '</td>'
      + '<td>' + linkCell + '</td>'
      + '<td style="white-space:nowrap;">' + escapeHtml(r.sales || na) + '</td>'
      + '<td style="white-space:nowrap;font-weight:600;color:var(--accent-light);">' + escapeHtml(r.aov || na) + '</td>'
      + '<td>' + escapeHtml(r.feature || na) + '</td>'
      + '<td style="white-space:nowrap;color:#34d399;font-weight:600;">' + escapeHtml(r.good || na) + '</td>'
      + '<td style="white-space:nowrap;color:#f87171;font-weight:600;">' + escapeHtml(r.bad || na) + '</td>'
      + '<td style="color:#34d399;font-size:12px;">' + escapeHtml(r.goodwhy || na) + '</td>'
      + '<td style="color:var(--text-secondary);font-size:12px;">' + escapeHtml(r.badwhy || na) + '</td>'
      + '<td style="font-size:12px;">' + escapeHtml(r.buyer || na) + '</td>'
      + '</tr>';
  }
  body.innerHTML = html;

  var meta = document.getElementById('srcMeta');
  if (meta) {
    meta.textContent = '关键词「' + kw + '」· 命中 ' + _sourcingRows.length + ' 个候选品 · 筛选 '
      + _srcPriceLabel(priceMin, priceMax)
      + ' / 好评率 ≥ ' + minRating + '% · 采用 ' + refCount + ' 条实时抓取参考 · 模型 '
      + (typeof modelNameById === 'function' ? modelNameById(getPickedModelId('sourcing')) : '');
  }
}

function copySourcingTable() {
  if (!_sourcingRows.length) return;
  var head = ['#', '商品名称', '平台', '搜同款链接', '参考来源', '近一个月销量', '客单价', '特点备注', '好评率', '差评率', '好评集中在', '差评集中在', '购买人群 / 年龄段'];

  var rows = [];
  for (var i = 0; i < _sourcingRows.length; i++) {
    var r = _sourcingRows[i];
    // 和页面渲染同一套规则：搜同款是程序拼的（一定能打开），参考来源必须过全等校验。
    // 粘出去的文档里绝不能留一个点不开的假详情页链接 —— 那比没有链接更糟，
    // 因为拿到文档的人会以为它核对过。
    var searchHref = srcSearchUrl(r.platform, r.name) || 'N/A';
    var refHref = _srcVerifiedRef(r.url) ? String(r.url).trim() : 'N/A';
    rows.push([String(i + 1), r.name || 'N/A', r.platform || 'N/A', searchHref, refHref,
      r.sales || 'N/A', r.aov || 'N/A',
      r.feature || 'N/A', r.good || 'N/A', r.bad || 'N/A', r.goodwhy || 'N/A', r.badwhy || 'N/A', r.buyer || 'N/A']
      .map(function(v) { return String(v).replace(/[\t\r\n]+/g, ' '); }));
  }

  // ---- text/plain：TSV，粘进 Excel / 飞书表格自动成列 ----
  var text = [head.join('\t')].concat(rows.map(function(c) { return c.join('\t'); })).join('\n');

  // ---- text/html：真表格。粘进 Word / 飞书文档 / 邮件时带边框和表头底色 ----
  // 为什么必须单独给一份 HTML：只写 text/plain 时，Word 和飞书文档收到的
  // 就是一坨制表符分隔的纯文字，表格框架完全丢失（这正是用户看到的现象）。
  // 样式必须写成**行内 style** —— 粘贴目标不会带上本站的 CSS。
  // border-collapse 也必须显式给，否则 Word 里会画出双线。
  var tdCss = 'border:1px solid #999;padding:6px 9px;font-size:12px;vertical-align:top;';
  var thCss = tdCss + 'background:#f2f2f2;font-weight:700;white-space:nowrap;';
  var html = '<table border="1" cellspacing="0" cellpadding="6" '
    + 'style="border-collapse:collapse;border:1px solid #999;font-family:Calibri,\'Segoe UI\',sans-serif;">'
    + '<thead><tr>'
    + head.map(function(h) { return '<th style="' + thCss + '">' + escapeHtml(h) + '</th>'; }).join('')
    + '</tr></thead><tbody>';
  for (var j = 0; j < rows.length; j++) {
    var c = rows[j];
    html += '<tr>';
    for (var k = 0; k < c.length; k++) {
      // 链接列现在是索引 3（搜同款）和 4（参考来源）。两列的值在上面已经校验过：
      // 搜同款是程序拼的、参考来源过了全等比对，所以这里只需再过一道 safeUrl 兜协议。
      var cell = escapeHtml(c[k]);
      if (k === 3 || k === 4) {
        // safeUrl 内部已经做过 escapeAttr，这里**不能**再套一层 —— 双重转义会把
        // 搜索链接里的 & 变成 &amp;amp;，京东/唯品会这类带 & 的地址粘出去就点不开了。
        var href = (typeof safeUrl === 'function') ? safeUrl(c[k]) : '';
        if (href) cell = '<a href="' + href + '">' + escapeHtml(c[k]) + '</a>';
      }
      html += '<td style="' + tdCss + '">' + cell + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table>';

  function done() { showToast('✅ 表格已复制（含框架，可粘进 Word / Excel / 飞书文档）'); }
  function fail() { showToast('⚠️ 复制失败'); }

  // 首选 clipboard.write：一次放两种格式，粘贴目标各取所需
  // （Word 取 text/html 得到表格，Excel 取 text/plain 得到分列）。
  if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
    try {
      var item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      });
      navigator.clipboard.write([item]).then(done).catch(function() { _copyRichFallback(html, text, done, fail); });
      return;
    } catch (e) { /* 落到下面的 fallback */ }
  }
  _copyRichFallback(html, text, done, fail);
}

// 兜底：选中一个离屏的富文本节点走 execCommand('copy')。
// 这条路径浏览器会自动同时放 text/html 和 text/plain，所以表格框架照样保得住。
// 不用 <textarea>（它只能出纯文本，就是丢框架的老做法）。
function _copyRichFallback(html, text, done, fail) {
  var host = document.createElement('div');
  host.setAttribute('contenteditable', 'true');
  // 不能用 display:none / visibility:hidden —— 选区在不可见节点上取不到内容。
  // 挪到视口外是唯一既不可见又能被 Selection 选中的做法。
  host.style.cssText = 'position:fixed;left:-99999px;top:0;white-space:normal;opacity:0;';
  host.innerHTML = html;
  document.body.appendChild(host);
  var ok = false;
  try {
    var range = document.createRange();
    range.selectNodeContents(host);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    ok = document.execCommand('copy');
    sel.removeAllRanges();
  } catch (e) { ok = false; }
  document.body.removeChild(host);
  if (ok) { done(); return; }
  // 富文本这条也失败，退回纯文本 —— 至少内容不丢
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(done).catch(fail);
  } else { fail(); }
}

// ============ 商品情报 · 示例商品页（一键体验抓取） ============
// 8 条**全部逐个实测过**能抓到真标题 + 真商品图 + 真参数，不是照国内平台名单凭空列的。
// 全部来自当当（product.dangdang.com），后端有 _parse_dangdang 专用解析器兜着。
//
// 为什么 8 条都在一个站上 —— 国内主流电商的商品页实测**没有一个能抓**：
//   淘宝/天猫 PC   → 2~5KB 反爬壳，商品数据全靠 JS 渲染
//   淘宝 H5        → 200，但标题就是占位的"商品详情页"（后端已加中文占位拦截）
//   京东           → item.jd.com 是空壳；item.m.jd.com 确实是服务端渲染，但只有
//                    **移动端 UA** 能拿到，而且同一 IP 连打几次就整段返回 2696 字节
//                    验证页（实测：换 UA 立刻复现、等待后仍被拦）。示例是一排按钮，
//                    用户会连着点 —— 必然集体失败，所以不能用。
//   拼多多/苏宁/得物/唯品会/1688/小米有品 → 反爬壳或"商品不存在"
//   追觅商城       → 200 但标题是"追觅商城-商品"，属于假成功
//   博库网        → 200 但标题是"博库网-登录"，登录墙假成功（后端已加拦截）
// 别再花时间调 UA 或补请求头：这些是需要执行 JS / 需要登录的硬墙。
// 后端的反爬与假成功拦截照旧保留 —— 用户手输这些平台链接时会得到明确失败提示，
// 而不是一张编出来的假卡片：假成功比失败更坏，用它生成的图文全错且看不出错在哪。
//
// 品类刻意铺开（个护小电 / 厨房家电 / 家纺 / 宠物 / 家居环境 / 运营图书），
// 好让用户一眼看出这个模块喂给图文和短视频生成的是什么样的素材。
//
// 选 ID 时注意：当当同一件商品常有多个商品页 ID（搜索结果里标题一模一样的那几条），
// 其中只有一个挂了完整主图集，其余只有 1 张。而且**搜索结果第一条往往就是只有 1 张的那个**
// （实测四件套 1260644047 / 猫砂盆 1807657962 / 收纳盒 1881724985 都是 1 张，
// 兄弟 ID 1309821137 / 1807657772 却有 8 张 / 4 张）。
// 抓不到多图不是解析器漏了 —— 页面里确实只有那 1 张，其余 ddimg 链接都是推荐位的
// 别家商品图（商品 ID 不同，已被 _parse_dangdang 的按 ID 反查挡掉）。
// 所以换示例前先用兄弟 ID 比一遍图片数和卖点数，两者都够了再往这里放。
var PRODUCT_SAMPLE_URLS = [
  { label: '💨 沙宣恒温电吹风', tag: '当当网',
    url: 'https://product.dangdang.com/1125243395.html' },
  { label: '🪒 飞利浦电动剃须刀', tag: '当当网',
    url: 'https://product.dangdang.com/1355114795.html' },
  { label: '☕ 德龙雀巢胶囊咖啡机', tag: '当当网',
    url: 'https://product.dangdang.com/1249092195.html' },
  { label: '🛏️ 伊迪梦全棉四件套', tag: '当当网',
    url: 'https://product.dangdang.com/1309821137.html' },
  { label: '🐱 半封闭防外溅猫砂盆', tag: '当当网',
    url: 'https://product.dangdang.com/1807657772.html' },
  { label: '💧 大宇无雾上加水加湿器', tag: '当当网',
    url: 'https://product.dangdang.com/1539235384.html' },
  { label: '📕 小红书运营·爆款种草', tag: '当当网',
    url: 'https://product.dangdang.com/29443992.html' },
  { label: '📗 短视频运营全流程', tag: '当当网',
    url: 'https://product.dangdang.com/29674824.html' }
];

function renderProductSampleChips() {
  var row = document.getElementById('productSampleChips');
  if (!row) return;
  var html = '';
  for (var i = 0; i < PRODUCT_SAMPLE_URLS.length; i++) {
    var s = PRODUCT_SAMPLE_URLS[i];
    html += '<button class="chip" onclick="useProductSample(' + i + ')" title="' + escapeAttr(s.url) + '">'
      + escapeHtml(s.label)
      + ' <span style="opacity:0.6;font-size:11px;">· ' + escapeHtml(s.tag) + '</span>'
      + '</button>';
  }
  row.innerHTML = html;
}

// 点示例：填入输入框并立刻抓取。示例现在只留实测抓得到的平台，
// 所以这里不再有"只填链接不抓"的降级分支。
function useProductSample(idx) {
  var s = PRODUCT_SAMPLE_URLS[idx];
  if (!s) return;
  var input = document.getElementById('productUrlInput');
  if (!input) return;
  input.value = s.url;
  if (typeof scrapeProduct === 'function') scrapeProduct();
}

async function tsOptimizePrompt() {
  var input = document.getElementById('tsPromptInput');
  if (!input) return;
  var raw = (input.value || '').trim();
  if (!raw) { showToast('⚠️ 请先填写文案主题'); return; }
  var btn = document.getElementById('btnTsOptimize');
  btn.disabled = true;
  var origText = btn.textContent;
  btn.innerHTML = '<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:currentColor;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 优化中...';
  try {
    var sys = '你是国内自媒体与电商内容运营专家，同时精通提示词写法。把用户这段粗略的文案需求改写成一份更具体、更好执行的中文提示词。保持原本意图不变，补上缺失的关键信息：目标平台、内容体裁、篇幅、语气、结构、结尾引导。只输出改写后的中文提示词本身，不要解释，不要加引号。';
    var optOut = await callModuleText('text-studio', sys, raw);
    var optimized = String(optOut || '').trim().replace(/^["'`]+|["'`]+$/g, '');
    if (optimized) input.value = optimized;
    showToast('✅ 提示词已优化（' + modelNameById(getPickedModelId('text-studio')) + '）');
  } catch (e) {
    console.error('[TextStudio] optimize err', e);
    showToast('⚠️ 优化失败 —— ' + ((e && e.message) || '请检查模型可用性'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
  }
}

var TS_PLATFORM_LABELS = {
  douyin: '抖音', kuaishou: '快手', shipinhao: '微信视频号', xiaohongshu: '小红书',
  bilibili: 'B站', wechat: '微信公众号', toutiao: '今日头条', zhihu: '知乎',
  weibo: '微博', taobao: '淘宝天猫详情'
};

async function tsGenerateCopy() {
  var input = document.getElementById('tsPromptInput');
  if (!input) return;
  var raw = (input.value || '').trim();
  if (!raw) { showToast('⚠️ 请先填写文案主题'); document.getElementById('tsPromptInput').focus(); return; }

  var typeSel = document.getElementById('tsType');
  var platSel = document.getElementById('tsPlatform');
  var copyType = typeSel ? typeSel.value : 'article';
  var target = platSel ? platSel.value : 'douyin';  // 兜底值要和下拉框第一项一致

  var btn = document.getElementById('btnTsGenerate');
  var loading = document.getElementById('tsLoading');
  var resultBox = document.getElementById('tsResult');
  var output = document.getElementById('tsOutput');
  btn.disabled = true;
  var origHtml = btn.innerHTML;
  btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 正在生成...';
  loading.style.display = 'block';
  resultBox.style.display = 'none';

  var typeGuidance = {
    article: '长图文软文（600-1000 字）。结构：开头一个能让人停下来的场景或反常识说法；中间 2-3 段给具体价值，每段落到一个可感知的细节（型号、价格带、用了多久、变化是什么）；结尾一句自然的行动引导。可以用小标题。',
    script: '带时间轴的短视频脚本。按 [00:00-00:XX] 分段，每段写清【口播】【画面】【字幕】三行。前 3 秒必须是钩子。结尾附拍摄与剪辑节奏建议（BGM 风格、卡点位置）。总时长按目标平台的常见时长自适应。',
    short_form: '3 条相互独立的短文案，每条自成一体、可单独发布，各不超过 140 字，钩子和切入角度不能重复。',
    private: '一篇私域推文：3 个备选标题（各 ≤22 字，不要标题党）+ 正文 800-1200 字（手机阅读友好、段落短、有小标题）+ 结尾一个软性引导 + 一条 ≤40 字的朋友圈/社群转发语。'
  };

  // 各平台的调性与推流规则。写进提示词的目的不是"风格好看"，
  // 而是**避免生成一发出去就被限流的内容** —— 比如小红书对硬广话术降权、
  // 抖音看前 3 秒完播、B站观众反感标题党，这些是平台机制层面的硬约束。
  var platformCultural = {
    douyin: '抖音：算法推荐为王，完播率和互动率决定推流。前 3 秒决定生死，开头就要给冲突或结论。口语化、短句、有节奏感，像真人说话不像念稿。人群覆盖最广、下沉与一二线都有。',
    kuaishou: '快手：下沉市场渗透高，"老铁"信任经济，主播私域粘性强。语气要实在、接地气、像熟人推荐，强调性价比和真实使用感，忌精致高冷的品牌腔。',
    shipinhao: '微信视频号：微信生态内，公私域联动，人群年龄层更宽、一二线为主，客单价更高。适合稳重可信的表达，可以带社交转发属性（"值得转给家人看"），不要过度网感。',
    xiaohongshu: '小红书：女性用户超七成、一二线为主，是种草决策的核心场。平台明确给"真实使用过程"加权、给硬广话术降权。必须第一人称、有具体场景和细节，标题带数字或场景，结尾配精准话题标签。',
    bilibili: 'B站：Z世代、中长视频 + 弹幕文化，数码/游戏/知识/二次元内容深度高。观众反感标题党和说教，愿意看长内容但要求讲透、有信息量，可以适度用梗但不能生硬。',
    wechat: '微信公众号：私域核心载体，读者多是已关注的老用户。适合长文、深度、品牌沉淀，看完会转发才算成功。理性、有细节、有观点，不要促销腔。',
    toutiao: '今日头条：算法推荐资讯流，泛人群、年龄层偏大。标题要信息量足、说清"是什么事"，正文平实好懂、段落短，忌网络黑话和圈内梗。',
    zhihu: '知乎：高知一二线用户，看专业背书和长尾搜索流量。先给结论再论证，要有数据、行业常识或亲历案例，主动指出常见误区，克制不吹，商业信息只在最后自然提及。',
    weibo: '微博：公域舆论场，热点营销和品牌事件的主战场。要有观点和可讨论性、能引发评论转发，单条精炼，不要堆话题标签。',
    taobao: '淘宝/天猫商品详情：面向已有购买意向的搜索用户。卖点前置、覆盖买家会搜的关键词、参数要翻译成用户能感知的好处，扫读友好，不要情绪化修饰。'
  };

  try {
    var systemPrompt = '你是一位有 10 年以上经验的国内自媒体与电商内容运营，长期在抖音、快手、微信视频号、小红书、B站、微信公众号、今日头条、知乎、微博以及淘宝天猫详情页上产出内容并跑数据。你写的中文是地道的中文表达，不是翻译腔。你熟悉国内的消费语境、平台生态、大促节奏（年货节、38 女王节、618、双11、双12）、人民币价格带和国内用户的决策习惯。\n\n'
      + '任务：为【' + target + '】这个平台写【' + copyType + '】类文案。\n'
      + '格式要求：' + (typeGuidance[copyType] || typeGuidance.article) + '\n'
      + '平台调性与推流规则：' + (platformCultural[target] || platformCultural.douyin) + '\n\n'
      + '硬性规则：\n'
      + '- 全文必须是中文，不要夹英文句子。商品型号、品牌名等专有名词保留原样即可。\n'
      + '- 用国内语境：价格用人民币，促销节点用 618 / 双11 / 年货节 / 38 女王节，尺寸重量用米/厘米/斤/克/毫升，参照的心智是淘宝天猫、京东、拼多多、抖音商城而不是海外平台。\n'
      + '- 严禁绝对化用词：不要出现"最""第一""顶级""国家级""绝对""百分百""永久"等表述。这既是《广告法》的红线，也会让笔记在小红书、抖音被降权限流。\n'
      + '- 不要承诺无法验证的功效（治疗、根治、7 天见效之类），不要编造检测数据、销量排名和权威认证。\n'
      + '- 必须分段：每个逻辑段落之间空一行，段落控制在 2-4 句，不要一整块文字糊在一起。\n'
      + '- 不要空话套话（赋能、打造闭环、引领新风尚、在这个快节奏的时代 等等），每句话都要带具体信息。\n'
      + '- 不要 markdown 代码围栏，不要 HTML 标签。'
      + richFormatRules();

    var userPrompt = '文案需求：\n' + raw + '\n\n现在开始写这篇【' + copyType + '】文案。';

    var out = normalizeCopyText(await callModuleText('text-studio', systemPrompt, userPrompt));
    if (!out) throw new Error('Empty response');

    // 显示 & 保存到资产库：先按段落转 HTML（内部已 escapeHtml），再把颜色标记
    // 转成内联样式。顺序不能颠倒 —— 先转标记的话，escapeHtml 会把刚生成的
    // <span style> 转义成字面文本显示出来。
    var richHtml = richMarkupToHtml(textToParagraphsHtml(out));
    output.innerHTML = richHtml;
    resultBox.style.display = 'block';
    if (typeof generatedArticles !== 'undefined' && Array.isArray(generatedArticles)) {
      generatedArticles.unshift({
        title: '[文案创作 · ' + (TS_PLATFORM_LABELS[target] || target) + '] ' + raw.slice(0, 40),
        content: richHtml,
        date: new Date().toLocaleString(),
        platform: target,
        kind: 'text-studio'
      });
      if (typeof updateAssetBadge === 'function') updateAssetBadge();
    }
    showToast('✅ ' + t('ts.saved.assets', '已保存到自媒体资产') + '（' + modelNameById(getPickedModelId('text-studio')) + '）');
  } catch (e) {
    console.error('[TextStudio] gen err', e);
    showToast('⚠️ 生成失败：' + (e && e.message || '未知错误'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
    loading.style.display = 'none';
  }
}

function tsCopy() {
  var out = document.getElementById('tsOutput');
  if (!out) return;
  if (!out.innerText.trim()) { showToast('没有可复制的内容'); return; }
  // 走"选中 DOM 再 execCommand"这条老路，不用 navigator.clipboard.writeText ——
  // 后者只能写纯文本，颜色标记刚转出来的 <span style> 会在粘贴时全丢掉。
  // 只有 text/html 剪贴板格式才能让公众号/小红书后台保留内联颜色。
  var tempDiv = document.createElement('div');
  tempDiv.style.position = 'fixed';
  tempDiv.style.left = '-9999px';
  tempDiv.innerHTML = out.innerHTML;
  document.body.appendChild(tempDiv);
  var range = document.createRange();
  range.selectNodeContents(tempDiv);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  try {
    if (document.execCommand('copy')) showToast('✅ 已复制（含颜色格式），可直接粘贴到公众号/小红书后台');
    else fallbackCopyText(out.innerText);
  } catch (e) {
    fallbackCopyText(out.innerText);
  }
  sel.removeAllRanges();
  document.body.removeChild(tempDiv);
}

function tsExport() {
  var out = document.getElementById('tsOutput');
  if (!out) return;
  if (!out.innerText.trim()) { showToast('没有可导出的内容'); return; }
  // 导 .html 而不是 .txt：纯文本文件装不下颜色，导出来的东西和屏幕上看到的不是一回事。
  // 字体栈写死不引 CSS 变量 —— 这个文件会脱离本站单独打开。
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>文案创作</title>'
    + '<style>body{max-width:760px;margin:40px auto;padding:0 20px;'
    + 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;'
    + 'font-size:16px;line-height:1.9;color:#1f2937;background:#fff;}p{margin:14px 0;}</style>'
    + '</head><body>' + out.innerHTML + '</body></html>';
  var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '文案创作_' + new Date().toISOString().slice(0,10) + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✅ 已导出 .html（含颜色排版）');
}

// 初始化：DOM Ready 时渲染 chips；语言切换时也重新渲染
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { tsRenderChips(); renderProductSampleChips(); renderHotspotKwChips(); renderSourcingKwChips(); initVoiceButtons(); });
} else {
  setTimeout(function() { tsRenderChips(); renderProductSampleChips(); renderHotspotKwChips(); renderSourcingKwChips(); initVoiceButtons(); }, 0);
}
// Hook 到 applyI18n：切换语言时 chip label 也跟着换
(function hookI18nForTs() {
  if (typeof applyI18n !== 'function') return;
  var origApply = applyI18n;
  window.applyI18n = function(root) {
    origApply(root);
    tsRenderChips();
    if (typeof renderCommercePlatforms === 'function') renderCommercePlatforms();
    if (typeof renderSocialPlatforms === 'function') renderSocialPlatforms();
    if (typeof renderHolidays === 'function') renderHolidays();
    if (typeof renderMetrics === 'function') renderMetrics();
    if (typeof renderModelShop === 'function') renderModelShop();
    if (typeof renderProductSampleChips === 'function') renderProductSampleChips();
    if (typeof renderHotspotKwChips === 'function') renderHotspotKwChips();
    if (typeof renderSourcingKwChips === 'function') renderSourcingKwChips();
    // 录音中切语言：applyI18n 会把按钮标签刷回"语音输入"，看上去像已经停了。
    // 把"停止并插入"重新写回去。识别语种不跟着改 —— 半句中文半句英文的
    // 识别结果没有意义，让本次会话按开录时的语种走完。
    if (_voiceRec && _voiceBtnId) {
      var _vb = document.getElementById(_voiceBtnId);
      var _vl = _vb && _vb.querySelector('[data-i18n]');
      if (_vl) _vl.textContent = (window.currentLang === 'en') ? 'Stop & insert' : '停止并插入';
    }
    if (typeof initVoiceButtons === 'function') initVoiceButtons();
    // 选品表已渲染过就跟着语言重画（表头走 data-i18n，正文是 JS 拼的，不重画会中英混排）
    if (typeof _sourcingRows !== 'undefined' && _sourcingRows.length && typeof renderSourcingTable === 'function') {
      var _sk = document.getElementById('srcKeywordInput');
      var _pmin = _srcParsePrice((document.getElementById('srcPriceMin') || {}).value);
      var _pmax = _srcParsePrice((document.getElementById('srcPriceMax') || {}).value);
      var _mr = parseInt((document.getElementById('srcMinRating') || {}).value, 10) || 85;
      renderSourcingTable(_sk ? _sk.value : '', _pmin, _pmax, _mr, 0);
    }
    if (typeof initModelPickers === 'function') initModelPickers();
    if (typeof renderImagePromptChips === 'function') renderImagePromptChips();
    if (typeof renderVcPromptChips === 'function') renderVcPromptChips();
  };
  // 补一次触发，让 hook 立即生效（原始 applyI18n 已在 hook 定义之前跑过）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { window.applyI18n(); });
  } else {
    setTimeout(function() { window.applyI18n(); }, 0);
  }
})();

// ============ 参考页 · 国内主流电商平台 ============
// 数据来自用户提供的《国内主流电商平台》清单，按「综合电商 → 内容/兴趣电商 →
// 社交/私域电商 → 垂直/特色电商」四组排列，组内按体量排。
//
// ⚠️ 字段是纯字符串，不是 {zh,en}。全站只有中文，双语字段等于每条写两遍
//    只显示一半 —— 前面几个任务反复出现的"只改了一半"就是这么来的。
//    渲染函数里的 L() 对纯字符串是直通的，不用改。
//
// 字段：audience 面向人群 / fit 适合品类 / fees 手续费佣金 /
//      rule 入驻规则 / traffic 流量玩法 / notes 平台亮点（含避坑）
// 原来还有个 entry 字段（'Seller Central' 之类），但渲染函数从来没用过
// —— 访问入口那列显示的是 url。这次直接删掉，不留没人读的字段。
var ECOMMERCE_PLATFORMS = [
  { name: '淘宝 / 天猫', icon: '🛒', url: 'https://www.taobao.com',
    audience: '全年龄全域 · 一二线到下沉全覆盖 · 有明确购买意图的搜索型用户',
    fit: '全品类 · 天猫做品牌旗舰 · 淘宝C店做白牌 · 服饰美妆家居是最大盘',
    fees: '淘宝C店 0 佣金（仅支付通道费约 0.6%）；天猫扣点 2–5% + 年费 3万–6万（按类目）',
    rule: '淘宝个人身份证即可开店；天猫需企业执照 + 商标（R标优先，TM标限类目）+ 保证金 5万–15万，走招商审核',
    traffic: '搜索关键词权重最高（标题/属性/坑位产出比）；直通车 + 引力魔方付费拉新；万相台做全域自动化；逛逛与直播补内容流量',
    notes: '生态最成熟、服务商和供应链最全；也是竞争最卷、流量最贵的一家。新店没有搜索权重，前 90 天基本靠付费和站外种草破冰' },
  { name: '京东', icon: '📦', url: 'https://www.jd.com',
    audience: '一二线为主 · 25–45 岁 · 男性偏多 · 认品牌认正品、对时效极敏感',
    fit: '3C数码 · 家电 · 手机 · 图书 · 商超快消 · 标品高客单',
    fees: 'POP 店扣点 2–8%（按类目）+ 平台使用费；自营是进货价模式，有账期',
    rule: '基本要求企业资质（个体户仅限部分类目）+ 完整品牌授权链路 + 质检报告；自营需招商谈判，账期 30–60 天',
    traffic: '站内搜索 + 京东快车 + 京准通；京东秒杀和百亿补贴是爆量位；PLUS 会员与自营流量池天然倾斜',
    notes: '物流售后体验最好，标品客单价最高；门槛与资质要求也是最严的一家，白牌和非标品很难起量' },
  { name: '拼多多', icon: '🟠', url: 'https://www.pinduoduo.com',
    audience: '下沉市场为主 · 价格极敏感 · 三到六线与银发人群渗透最深',
    fit: '白牌标品 · 农产品生鲜 · 日百消耗品 · 有成本优势的工厂货',
    fees: '0 佣金 0 年费，仅收支付通道费约 0.6%；保证金 1000 元起',
    rule: '个人身份证可开个人店，企业店需执照。规则以消费者为绝对优先，仅退款/极速退款的判罚极重',
    traffic: '系统按「同款最低价」分配流量 —— 价格就是流量；百亿补贴、限时秒杀、多多进宝分销是三大爆量入口',
    notes: '冷启动最快、开店成本最低；代价是价格战无休止和高判罚风险。适合有工厂或产业带成本优势的卖家，纯贸易商很难活' },
  { name: '抖音电商（抖音小店）', icon: '🎵', url: 'https://fxg.jinritemai.com',
    audience: '全年龄泛人群 · 没有明确购买意图、刷到就买的兴趣型用户',
    fit: '非标品 · 服饰 · 美妆个护 · 食品 · 家居小物 · 强视觉强演示的品类',
    fees: '类目佣金 1–5% + 达人分销佣金（自行设定，通常 10–30%）',
    rule: '企业或个体户执照 + 保证金 2000 元起；品牌类目需授权。带货口播受广告法约束严，违规下架非常快',
    traffic: '短视频推荐 + 直播间实时流量 + 商城搜索三条腿；千川放大 GPM 高的素材；精选联盟达人分销是冷启动主力',
    notes: '增长最快、爆发力最强 —— 一条视频能打爆一个 SKU；但流量不沉淀，停投即停量，必须持续产内容养账号' },
  { name: '快手电商（快手小店）', icon: '⚡', url: 'https://s.kwaixiaodian.com',
    audience: '下沉市场 · 三线及以下 · 老铁信任关系强 · 复购靠主播人格而非品牌',
    fit: '性价比日百 · 产业带白牌 · 食品生鲜 · 服饰鞋包 · 农货',
    fees: '类目佣金 1–5% + 分销佣金；保证金按类目 500–2000 元起',
    rule: '门槛低于抖音，个体户可开；对「货找人」的自然流量更宽松，但虚假宣传和售后问题同样重罚',
    traffic: '私域粉丝复访占比全平台最高（老铁经济）；磁力金牛付费；快分销达人合作；直播是绝对主场，短视频偏引流',
    notes: '主播私域粘性和复购率是全平台最高的一档，适合做人格化 IP；缺点是客单价天花板低、一二线人群覆盖弱' },
  { name: '小红书电商（小红书店铺）', icon: '📕', url: 'https://ark.xiaohongshu.com',
    audience: '女性 >70% · 一二线为主 · 18–35 岁 · 决策前重度搜索比价',
    fit: '美妆护肤 · 服饰穿搭 · 家居家饰 · 母婴 · 香水香氛 · 设计师品牌',
    fees: '佣金统一 5%（部分类目有活动减免）',
    rule: '企业或个体户执照 + 保证金 1000 元起；笔记带商品链接必须走蒲公英报备，硬广不报备会直接限流',
    traffic: '搜索占比极高（用户把它当搜索引擎用）；笔记种草 → 收藏 → 搜索转化的长链路；薯条投放 + 蒲公英达人合作',
    notes: '种草到成交的链路最短、客单价明显高于同类；坑最多 —— 未报备商业笔记、绝对化用语、导流微信都会限流甚至封号' },
  { name: '微信视频号小店', icon: '🎬', url: 'https://channels.weixin.qq.com',
    audience: '微信全域 · 年龄层最宽（银发人群占比显著）· 熟人社交链信任度高',
    fit: '高客单转化 · 服饰 · 食品 · 保健 · 珠宝 · 知识付费与虚拟服务',
    fees: '技术服务费 1–5%（按类目），微信支付通道费另计',
    rule: '与微信支付体系打通，需企业主体（个体户限部分类目）；已升级为「微信小店」，可与公众号/小程序/企微互通',
    traffic: '公私域联动是核心 —— 社群、公众号、朋友圈把人灌进直播间，再由推荐流量放大；推荐权重看社交关系链',
    notes: '唯一能把私域和公域真正打通的闭环生态，复购成本最低；缺点是公域量级不如抖音，冷启动重度依赖已有私域' },
  { name: '有赞', icon: '🧰', url: 'https://www.youzan.com',
    audience: '品牌自有会员 · 老客复购 · 门店导购带来的线下客',
    fit: '私域微商城 · 会员精细化运营 · 连锁门店线上化 · 社群团购',
    fees: 'SaaS 年费制（基础版数千元/年起），不抽佣',
    rule: '它不是平台是工具 —— 没有平台流量，开通即用，流量全部自己带',
    traffic: '靠公众号、企微、社群、导购分销引流；内置会员卡、储值、拼团、分销员等私域玩法',
    notes: '私域工具里最成熟、插件生态最全；前提是先有流量再上工具，没私域的商家买了就是个空壳' },
  { name: '微盟', icon: '🧩', url: 'https://www.weimob.com',
    audience: '中大型品牌与连锁 · 门店会员 · 需要全渠道打通的用户体系',
    fit: '智慧零售 · 全渠道会员打通 · 导购与门店业绩归属 · 高定制需求',
    fees: 'SaaS 年费 + 定制开发费，不抽佣',
    rule: '同为工具型，偏中大客户，实施周期比有赞长，通常要配解决方案团队',
    traffic: '全靠自有渠道；强项是多门店、多角色场景下的分佣与业绩归属规则',
    notes: '适合已有几十家门店、要做全渠道打通的品牌；小商家用不上这个复杂度，上了也是浪费' },
  { name: '多多买菜', icon: '🥬', url: 'https://mms.pinduoduo.com',
    audience: '下沉社区家庭用户 · 中老年为主 · 价格极敏感 · 次日到店自提',
    fit: '生鲜蔬果 · 米面粮油 · 日百快消 · 短保食品',
    fees: '平台定价主导，赚供货价差；按账期结算',
    rule: '需供应商资质 + 食品经营许可（生鲜类）；按城市仓招标，供货报价直接决定能否中选',
    traffic: '没有内容流量，靠团长和社区自提点的地推加平台补贴',
    notes: '量大周转快，适合有本地供应链和仓配能力的供应商；定价权在平台，毛利极薄，拼的是效率不是营销' },
  { name: '美团优选', icon: '🛍️', url: 'https://www.meituan.com',
    audience: '社区家庭用户 · 一线到县域 · 高频刚需 · 即时性需求强',
    fit: '生鲜 · 快消 · 日百 · 本地供应链品类',
    fees: '供货价模式、平台定价；部分品类抽佣',
    rule: '供应商资质审核 + 品控要求；能与美团本地生活生态（外卖/闪购）的资源协同',
    traffic: '依托美团本地流量和社区团长网络，没有内容分发逻辑',
    notes: '本地生活生态协同是它和多多买菜的差异点；同样是薄毛利、拼供应链效率的生意' },
  { name: '得物', icon: '👟', url: 'https://www.dewu.com',
    audience: 'Z世代 · 18–28 岁 · 男性偏多 · 一二线 · 潮流与球鞋文化人群',
    fit: '潮鞋 · 潮服 · 潮玩 · 手表 · 美妆香水 · 数码配件',
    fees: '佣金约 3–8% + 鉴别查验服务费',
    rule: '需品牌授权或正规货源凭证 —— 逐件先鉴别后发货，假货零容忍，罚则极重',
    traffic: '站内搜索 + 商品榜单 + 社区内容（穿搭/开箱）种草；平台的正品鉴别本身就是信任背书',
    notes: '年轻高客单人群最集中的垂类；核心壁垒是鉴别体系，也意味着货源合规性就是入场券' },
  { name: '唯品会', icon: '💄', url: 'https://www.vip.com',
    audience: '女性为主 · 25–40 岁 · 二三线 · 对折扣和品牌尾货敏感',
    fit: '品牌服饰特卖 · 美妆 · 内衣 · 鞋包 · 尾货清库存',
    fees: '扣点约 15–25%（特卖模式明显高于普通平台）',
    rule: '以品牌合作与买断特卖为主，需品牌授权和品质抽检；档期制排期，要配合平台节奏供货',
    traffic: '不用打搜索红海，靠平台档期推荐位和短信/App 推送；流量由平台分配',
    notes: '清库存效率最高的渠道，不用自己投流；代价是扣点高、定价权弱，不适合做品牌新品首发' },
  { name: '苏宁易购', icon: '🔌', url: 'https://www.suning.com',
    audience: '二三线家庭用户 · 家电 3C 换新需求 · 看重线下服务与上门安装',
    fit: '大家电 · 空冰洗 · 数码 · 家装建材 · 需要上门安装的品类',
    fees: '扣点 3–8%（按类目）',
    rule: '企业资质 + 品牌授权 + 售后服务承诺（安装维修网点覆盖）',
    traffic: '平台搜索 + 门店导购线上化 + 以旧换新与国补活动位',
    notes: '线下门店和安装服务网络是它的差异点，适合大件家电；线上流量体量与京东天猫差距明显' },
  { name: '1688', icon: '🏭', url: 'https://www.1688.com',
    audience: 'B端买家 · 电商卖家 · 批发商 · 实体店主 · 找货源做一件代发的人',
    fit: '源头厂货 · 批发大宗 · 一件代发 · 定制加工（OEM/ODM）',
    fees: '免费开店；诚信通会员 6688 元/年起（不开通几乎拿不到流量）',
    rule: '以企业执照为主；实力商家、超级工厂等标签需实地认证，认证等级直接决定曝光',
    traffic: '关键词搜索是绝对主力（B端买家目标明确）；诚信通排名 + 一件代发标签 + 采源宝分销',
    notes: '全国最大的批发货源池，也是所有电商卖家的上游；做B端和C端完全是两套逻辑 —— 拼报价、起订量和交期，不拼内容' },
  { name: '当当', icon: '📚', url: 'https://www.dangdang.com',
    audience: '阅读人群 · 学生家长 · 25–45 岁 · 图书教辅刚需',
    fit: '图书 · 教辅 · 童书 · 文创办公 · 图书类目仍有独特优势',
    fees: '扣点按类目，图书类相对低',
    rule: '图书类需出版物经营许可证；商家以出版社和图书批发商为主',
    traffic: '站内搜索 + 图书榜单 + 大促满减（图书大促的满减力度是它的招牌）',
    notes: '图书垂类的用户心智还在，全品类竞争力已经很弱；只做图书教辅可以，别指望它带其他类目' }
];

// ============ 参考页 · 国内主流自媒体平台 ============
// 数据来自用户提供的《国内主流自媒体平台》清单，按「短视频/直播 →
// 图文/资讯 → 音频/其他垂直」三组排列。
//
// algo 那列是这张表最有价值的部分 —— 需求原话是"作为指引和避坑的帮助"，
// 而国内各平台真正的差别不在内容形式（都能发短视频），在推流规则：
// 抖音赛马、快手偏关注流、小红书吃搜索长尾、B站看三连、公众号根本没算法。
// 不讲清这个，这张表就只是一份平台名单。
var SOCIAL_MEDIA_PLATFORMS = [
  { name: '抖音', icon: '🎵', url: 'https://www.douyin.com',
    format: '15秒–3分钟短视频 · 直播 · 图文笔记（近年加重）· 抖音商城',
    audience: '日活超 6 亿 · 全年龄全域 · 娱乐与种草兼具 · 一二线到县域全覆盖',
    algo: '去中心化赛马：新内容先给 200–500 的初始流量池，按完播率、互动率、转粉率决定是否推进下一个更大的池子，层层递进。前 3 秒决定完播，5 秒跳出基本就判死。0 粉也能爆，但爆完不沉淀',
    notes: '国内流量最大、爆发力最强的单一平台；坑在于内容生命周期极短（48 小时内定生死），必须持续产出，断更后账号权重衰减很快' },
  { name: '快手', icon: '⚡', url: 'https://www.kuaishou.com',
    format: '短视频 · 长时直播 · 快手小店带货',
    audience: '下沉市场渗透率最高 · 三线及以下 · 老铁文化 · 私域粘性强',
    algo: '比抖音更偏「关注流」分配 —— 老粉复访权重高，同城流量池也强。平台刻意压低基尼系数，中小创作者更容易拿到稳定流量，不像抖音那样赢者通吃',
    notes: '复购和信任度是全平台最高的一档，适合做人格化 IP 和长期私域；缺点是一二线人群和高客单品类接受度低' },
  { name: '微信视频号', icon: '🎬', url: 'https://channels.weixin.qq.com',
    format: '短视频 · 直播 · 与公众号/朋友圈/社群互通',
    audience: '微信 13 亿生态 · 年龄层最宽（银发人群占比显著）· 一二线到县域',
    algo: '社交推荐 + 机器推荐双引擎 —— 「朋友点赞」是它独有的分发杠杆，社交关系链先起量，再进公域推荐池。所以冷启动看私域，放大看公域',
    notes: '唯一能把私域和公域打通的平台，转化与复购成本最低；缺点是纯公域爆款难度高于抖音，创作者生态还不成熟（也意味着还没那么卷）' },
  { name: '小红书', icon: '📕', url: 'https://www.xiaohongshu.com',
    format: '图文笔记（主力）· 视频笔记 · 直播 · 商品笔记',
    audience: '女性 >70% · 一二线为主 · 18–35 岁 · 消费决策前的搜索主阵地',
    algo: '搜索权重远高于其他平台 —— 笔记进入搜索池后能持续吃几个月长尾流量。CES 评分（点赞1分/收藏1分/评论4分/关注8分）决定是否进下一层流量池，收藏率是核心指标',
    notes: '种草到决策的链路最短、内容长尾价值最高；坑也最多 —— 未报备的商业笔记、绝对化用语、导流微信都会限流甚至封号，运营必须先读透社区规范' },
  { name: 'B站', icon: '📺', url: 'https://www.bilibili.com',
    format: '中长视频（5–30 分钟）· 弹幕 · 专栏 · 直播 · 竖屏 Story',
    audience: 'Z世代为主 · 18–30 岁 · 高学历 · 数码/游戏/知识/二次元深度用户',
    algo: '完播率和「三连」（点赞+投币+收藏）权重最高，看内容质量不看更新频率。视频长尾极强，一年前的视频仍能靠搜索和推荐持续涨播放，是最像 YouTube 的国内平台',
    notes: '深度内容的沉淀价值最高、用户忠诚度最强；坑在于社区对硬广极度敏感（恰饭要坦白讲），且制作成本远高于短视频' },
  { name: '微信公众号', icon: '💬', url: 'https://mp.weixin.qq.com',
    format: '深度长文 · 图文推送 · 内嵌视频号 · 服务号菜单',
    audience: '私域核心载体 · 25–45 岁 · 主动订阅的高意向人群',
    algo: '严格说没有推荐算法 —— 订阅号流量 = 粉丝数 × 打开率（行业均值已降到 2–5%）。近年加了「看一看」和信息流推荐补公域，但主体仍是私域触达',
    notes: '品牌沉淀和深度内容的最佳载体，一篇文章能讲清一个复杂产品；坑是没有公域红利，涨粉极难，必须靠其他平台导流' },
  { name: '今日头条', icon: '📰', url: 'https://www.toutiao.com',
    format: '图文资讯 · 微头条 · 短视频 · 问答 · 可挂小程序与商品卡',
    audience: '泛资讯人群 · 30–50 岁偏多 · 二三线及以下 · 通勤碎片时间',
    algo: '最典型的协同过滤 + 内容标签推荐 —— 标题和封面决定点击率，点击率决定推荐量级。冷启动靠标题能力，但读完率会把标题党拉回来',
    notes: '流量体量大、审核相对宽松、适合泛生活泛资讯批量分发；缺点是用户忠诚度低、互动弱，涨粉不等于影响力' },
  { name: '百度百家号', icon: '🔍', url: 'https://baijiahao.baidu.com',
    format: '图文 · 短视频 · 问答 · 图集',
    audience: '百度搜索用户 · 有明确检索意图 · 全年龄',
    algo: '核心不是推荐而是「被搜索收录」—— 内容会进百度搜索结果，优质内容能长期占住关键词首页。信息流推荐是辅助',
    notes: '搜索端品牌占位和知识类内容的最佳选择，长尾生命周期以年计；坑是信息流本身流量质量一般，别拿它当抖音用' },
  { name: '知乎', icon: '❓', url: 'https://www.zhihu.com',
    format: '问答（主力）· 文章 · 想法 · 专栏 · 盐选付费',
    audience: '高知一二线 · 25–40 岁 · 决策前深度调研 · 对硬广警惕度最高',
    algo: '威尔逊得分排序 —— 高赞回答能长期占住问题首屏，而知乎问题在百度搜索里权重极高。一条好回答可以持续三五年带流量，是长尾之王',
    notes: '专业背书、品类科普、口碑防御的最佳阵地；坑在于社区反营销氛围浓，软文一眼被识破并折叠，必须真给干货' },
  { name: '微博', icon: '🔥', url: 'https://weibo.com',
    format: '短文 · 图文 · 视频 · 话题超话 · 热搜',
    audience: '公域舆论场 · 年轻女性偏多 · 明星粉丝与热点围观人群',
    algo: '热搜和话题是主分发逻辑，转发链路带来指数级扩散；单条内容生命周期以小时计，靠发布密度和热点时效取胜',
    notes: '热点营销、品牌事件、明星 KOL 联动不可替代的场子；日常活跃度确实在下滑，但舆情和公关阵地的价值仍然唯一' },
  { name: '喜马拉雅', icon: '🎧', url: 'https://www.ximalaya.com',
    format: '音频节目 · 有声书 · 播客 · 付费专栏 · 直播',
    audience: '通勤/家务/睡前场景 · 25–45 岁 · 亲子、财经、职场知识需求',
    algo: '订阅和分类榜单驱动，推荐权重看完播与订阅转化；内容生命周期长，一个专辑可以持续更新持续吃流量',
    notes: '最大的音频平台，知识付费和亲子内容变现路径成熟；场景独占（用户手上在忙、眼睛空不出来），但不适合需要视觉展示的品类' },
  { name: '豆瓣', icon: '📗', url: 'https://www.douban.com',
    format: '短评长评 · 小组讨论 · 日记 · 相册 · 书影音条目',
    audience: '文艺兴趣人群 · 一二线 · 高学历 · 对商业化最敏感',
    algo: '基本没有推荐算法 —— 靠小组、条目页和搜索自然沉淀，内容留存时间极长',
    notes: '图书影视文艺类口碑的源头，小众品类的真实口碑池；坑是商业化容忍度全网最低，营销痕迹重会被直接举报删帖' },
  { name: '搜狐号', icon: '📄', url: 'https://mp.sohu.com',
    format: '图文资讯 · 短视频',
    audience: '泛资讯人群 · 30 岁以上 · 传统门户读者',
    algo: '门户编辑推荐 + 信息流分发，内容容易被搜索引擎收录',
    notes: '作为品牌分发矩阵的一环有价值（多平台同源内容提升搜索覆盖）；单独运营 ROI 很低，定位是补位不是主力' },
  { name: '网易号', icon: '🎼', url: 'https://mp.163.com',
    format: '图文 · 短视频 · 专栏',
    audience: '泛资讯与泛文娱人群 · 评论区文化独特',
    algo: '信息流推荐 + 网易系（新闻/云音乐）站内分发，搜索收录良好',
    notes: '评论区活跃度是门户里最高的，适合做话题型内容；同样属于分发矩阵的补位角色' },
  { name: '企鹅号', icon: '🐧', url: 'https://om.qq.com',
    format: '图文 · 短视频 · 可一稿分发至腾讯新闻/腾讯视频/QQ浏览器',
    audience: '腾讯系产品用户 · 覆盖面广 · 泛人群',
    algo: '一次发布多端分发，推荐主要依赖内容标签匹配',
    notes: '一稿多端是它最大的效率优势；内容质量门槛不高，流量也不稳定，适合放进矩阵批量分发' }
];

function _refEsc(s) { return String(s == null ? '' : s); }
function renderCommercePlatforms() {
  var body = document.getElementById('commercePlatformsBody');
  if (!body) return;
  var html = '';
  // L() 保留着：数据已经拍平成纯字符串，但这个函数还兼容 {zh,en} 形态，
  // 万一以后哪张表又塞回对象也不会渲染出 [object Object]。
  function L(f) { return (typeof f === 'object' && f) ? f.zh : f; }
  for (var i = 0; i < ECOMMERCE_PLATFORMS.length; i++) {
    var p = ECOMMERCE_PLATFORMS[i];
    html += '<tr>'
      + '<td style="white-space:nowrap;font-weight:600;">' + p.icon + ' ' + _refEsc(p.name) + '</td>'
      + '<td>' + _refEsc(L(p.audience)) + '</td>'
      + '<td><a href="' + safeUrl(p.url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent-light);text-decoration:underline;">' + _refEsc(p.url.replace(/^https?:\/\//, '')) + ' ↗</a></td>'
      + '<td>' + _refEsc(L(p.fit)) + '</td>'
      + '<td>' + _refEsc(L(p.fees)) + '</td>'
      + '<td style="font-size:12px;">' + _refEsc(L(p.rule)) + '</td>'
      + '<td style="font-size:12px;">' + _refEsc(L(p.traffic)) + '</td>'
      + '<td style="color:var(--text-secondary);font-size:12px;">' + _refEsc(L(p.notes)) + '</td>'
      + '</tr>';
  }
  body.innerHTML = html;
}
function renderSocialPlatforms() {
  var body = document.getElementById('socialPlatformsBody');
  if (!body) return;
  var html = '';
  function L(f) { return (typeof f === 'object' && f) ? f.zh : f; }
  for (var i = 0; i < SOCIAL_MEDIA_PLATFORMS.length; i++) {
    var p = SOCIAL_MEDIA_PLATFORMS[i];
    html += '<tr>'
      + '<td style="white-space:nowrap;font-weight:600;">' + p.icon + ' ' + _refEsc(p.name) + '</td>'
      + '<td><a href="' + safeUrl(p.url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent-light);text-decoration:underline;">' + _refEsc(p.url.replace(/^https?:\/\//, '')) + ' ↗</a></td>'
      + '<td>' + _refEsc(L(p.format)) + '</td>'
      + '<td>' + _refEsc(L(p.audience)) + '</td>'
      + '<td style="font-size:12px;">' + _refEsc(L(p.algo)) + '</td>'
      + '<td style="color:var(--text-secondary);font-size:12px;">' + _refEsc(L(p.notes)) + '</td>'
      + '</tr>';
  }
  body.innerHTML = html;
}
// ============ 参考页 · 国内营销节日 ============
// 变量名从 US_MARKETING_HOLIDAYS 改成 CN_ —— 内容都是 618/双十一了，
// 名字还带 US 的话下一个改这段的人会先愣一下（renderHolidays 里两处引用同改）。
//
// 22 个节点，按 sortKey（月-日近似值）排，农历节日取对应公历的大致位置。
// tier 的判据是「单节点能否占到全年 GMV 的可观份额」，不是热闹程度：
//   S = 年货节 / 三八 / 618 / 双十一 —— 四个，占全年大促预算的绝大部分
//   A = 有明确送礼或刚需场景、窗口 3–7 天的节点
//   B = 只有小众品类受益、工作量大于收益，蹭话题即可
// 春节被放在 A 而不是 B：成交确实掉，但用户在线时长是全年最高，
// 是内容蓄水的关键节点 —— 按 B 级对待等于白扔一周的免费流量。
var CN_MARKETING_HOLIDAYS = [
  { sortKey: '01-01', tier: 'A',
    date: '1月1日',
    name: '元旦跨年',
    feature: '跨年仪式感叠加新年焕新心智，是年货节前的第一波试水，主要吃「新年第一件」的内容热度',
    category: '家居焕新 · 收纳 · 小家电 · 香氛 · 自律好物 · 礼盒装',
    action: '备货按日销 2–3 倍；提前 7 天出「新年计划/焕新清单」选题；社媒发跨年仪式感短视频 + 小额新年券，主要吃自然流量、少量加投',
    hook: '新年第一件 · 跨年清单 · 新的一年从换掉它开始' },
  { sortKey: '01-10', tier: 'S',
    date: '1月上旬 – 除夕前',
    name: '年货节',
    feature: '春节前唯一的 S 级大促，全民囤货、礼赠属性极强；同时是全年物流最紧张的时段 —— 最后发货日就是生死线',
    category: '食品礼盒 · 坚果糖果 · 白酒饮品 · 家清日百 · 小家电 · 红色系服饰 · 送礼刚需品',
    action: '备货按日销 8–12 倍，并预留返乡断货缓冲；提前 30 天启动年货主题内容，重点做「送长辈/送客户」礼赠场景；50+ KOC 铺量 + 2–3 场垂类达人直播；千川与引力魔方放量 100–200%；全渠道置顶「腊月X日前下单保证年前送到」',
    hook: '年货清单 · 送长辈不踩雷 · 年前最后一批发货 · 满199减30' },
  { sortKey: '02-05', tier: 'A',
    date: '农历除夕 – 正月初七',
    name: '春节假期',
    feature: '成交下滑但用户在线时长全年最高 —— 这是内容蓄水节点，不是成交节点。物流普遍停运或延迟，硬推成交只会换来一堆差评',
    category: '虚拟服务 · 知识付费 · 拜年礼盒（预售）· 以春节场景内容为主',
    action: '备货按日销 1 倍、只主推现货和虚拟品；产能全部转内容 —— 拜年短视频、亲情场景、返乡故事，为节后蓄粉；明确公告发货时间，宁可少卖也不要差评；不加投',
    hook: '春节不打烊 · 初七发货 · 新年好物先收藏' },
  { sortKey: '02-14', tier: 'A',
    date: '2月14日',
    name: '情人节',
    feature: '情侣送礼窗口只有 3–5 天，礼盒包装和「送她/送他」的场景内容比产品参数重要得多',
    category: '美妆香水 · 珠宝配饰 · 鲜花 · 数码配件 · 情侣款 · 礼盒装',
    action: '备货按日销 2–4 倍，礼盒包装单独备量；换一批情人节封面和选题；小额专属券 + 赠品（贺卡/礼袋）；少量 KOC 补种草，主要吃自然流量',
    hook: '送她不出错 · 情人节礼盒 · 直接下单不用挑' },
  { sortKey: '03-08', tier: 'S',
    date: '3月上旬（平台档期通常 3/4–3/8）',
    name: '三八女王节',
    feature: '上半年第一个 S 级大促，女性消费心智最集中；也是 618 之前最重要的一次爆款测款窗口',
    category: '美妆护肤 · 服饰内衣 · 个护小家电 · 母婴 · 保健品 · 悦己型消费',
    action: '备货按日销 6–10 倍；提前 15–20 天蓄水加购，内容重点铺「悦己/自我投资」而不是「被送礼」；50+ KOC 种草 + 达人直播；千川放量 100–200%；拿这次的数据定 618 主推 SKU',
    hook: '女王节 · 对自己好一点 · 满300减50 · 直播间专享价' },
  { sortKey: '03-15', tier: 'B',
    date: '3月15日',
    name: '315 消费者权益日',
    feature: '不是促销节点而是信任节点 —— 消费者对质检、资质、售后的关注度全年最高，同时是竞品被曝光时的舆情高发期',
    category: '不限品类，重点是质检与资质型内容',
    action: '备货不变；发质检溯源、工厂实拍、售后承诺类内容，把信任资产做厚；0 预算，不做促销、不加投',
    hook: '质检报告公开 · 敢让你退 · 工厂实拍' },
  { sortKey: '04-05', tier: 'B',
    date: '4月上旬',
    name: '清明 / 春季换季',
    feature: '假期短、促销弱，真正的价值是春夏换季的品类切换节点',
    category: '春夏服饰 · 户外露营 · 防晒 · 清洁除潮 · 踏青装备',
    action: '备货按日销 1–2 倍，重心是上新不是促销；内容切换到春夏场景（踏青/防晒/露营）；只在文案带节气关键词，不加投',
    hook: '换季上新 · 春天第一件 · 露营清单' },
  { sortKey: '05-01', tier: 'A',
    date: '5月1日 – 5日',
    name: '五一劳动节',
    feature: '五天长假带出「出游」和「居家」两条场景线，是 618 之前的一次热度中继',
    category: '旅行出行 · 户外装备 · 便携小电 · 防晒 · 零食 · 车载用品',
    action: '备货按日销 3–4 倍；提前 10 天出「五一出行清单」选题；小额假期券 + 少量 KOC；适度加投，顺势为 618 蓄加购人群',
    hook: '五一出行清单 · 假期必备 · 满199减20' },
  { sortKey: '05-11', tier: 'A',
    date: '5月第二个周日',
    name: '母亲节',
    feature: '送礼刚需明确，省力型家居和个护礼盒转化率极高；情感内容的转化效率远高于参数罗列',
    category: '个护小家电 · 美妆护肤 · 按摩仪 · 厨房省力工具 · 保健品 · 珠宝',
    action: '备货按日销 2–4 倍；批量产「送妈妈」情感场景内容；专属券 + 免费礼盒包装；少量 KOC 置换，自然流量为主',
    hook: '送妈妈的第一份 · 母亲节礼盒 · 妈妈用了不撒手' },
  { sortKey: '05-20', tier: 'A',
    date: '5月20日',
    name: '520 表白日',
    feature: '年轻情侣的第二个情人节，客单价和冲动性都高于 2·14，短视频和直播间的即时转化尤其强',
    category: '鲜花 · 美妆香水 · 珠宝 · 情侣礼盒 · 数码配件 · 甜品',
    action: '备货按日销 2–3 倍，礼盒和贺卡备足；换 520 主题封面；限时直播间专享价 + 赠品；小额加投专打冲动转化',
    hook: '520 礼盒 · 表白不用愁 · 今天下单今天到' },
  { sortKey: '06-01', tier: 'B',
    date: '6月1日',
    name: '儿童节',
    feature: '全平台看是 B 级，但母婴/玩具/童装类目要按 A 级对待 —— 品类分化最明显的一个节点',
    category: '玩具 · 童装 · 童书 · 亲子装 · 儿童零食（母婴类目升级为 A 级操作）',
    action: '非母婴类目备货不变、只带话题；母婴类目备货按日销 3–5 倍并配专属券；发亲子场景内容；同时开始 618 预热蓄水',
    hook: '六一礼物 · 亲子清单 · 童年该有的' },
  { sortKey: '06-18', tier: 'S',
    date: '5月下旬预售 – 6月20日',
    name: '618 年中大促',
    feature: '全年第二大促，京东主场、全网跟进；战线长达三周以上（预售/开门红/爆发/返场），节奏管理比折扣力度更决定成败',
    category: '全品类；3C家电和大件在京东侧最强，服饰美妆在淘系和抖音侧最强',
    action: '备货按日销 10–15 倍并分批补货；提前 30–45 天报名会场、锁定达人排期；预售期主攻加购蓄水，开门红当天放量；50+ KOC + 3–5 场达人直播；千川/引力魔方/万相台放量 200–300%；预热→开门红→日常→返场四阶段脚本各自独立，不要一套素材用到底',
    hook: '618 开门红 · 前2小时半价 · 加购立减 · 跨店满300减50' },
  { sortKey: '06-21', tier: 'B',
    date: '6月第三个周日',
    name: '父亲节',
    feature: '紧贴 618 尾声，热度被大促吸走，实际转化远弱于母亲节',
    category: '数码配件 · 剃须刀 · 车载用品 · 工具 · 茶酒 · 运动装备',
    action: '备货不变，用 618 返场库存承接；只换一批封面和文案带父亲节关键词；0 额外预算',
    hook: '送爸爸 · 父亲节礼物 · 他不说但会用' },
  { sortKey: '08-01', tier: 'B',
    date: '7月 – 8月',
    name: '暑期档',
    feature: '没有集中大促，但有持续的暑期场景需求 —— 是全年最适合测新品、养账号权重的窗口',
    category: '防晒 · 消暑家电 · 泳装 · 旅行 · 学生数码 · 零食饮品',
    action: '备货按日销 1–2 倍，重点是测款；把内容产能用在测选题和封面上，为双11养账号权重；不加投或只做小额测试投',
    hook: '夏日必备 · 暑假清单 · 学生党平替' },
  { sortKey: '08-20', tier: 'A',
    date: '农历七月初七（通常在 8月）',
    name: '七夕节',
    feature: '中式情人节，礼赠属性明确且客单价高于 520，「中式浪漫」的内容调性比西式表白更吃香',
    category: '珠宝首饰 · 美妆香水 · 国风服饰 · 鲜花 · 高客单礼盒',
    action: '备货按日销 2–4 倍；提前 7–10 天铺国风与中式浪漫选题；专属券 + 精致包装 + 刻字定制服务；少量达人合作，适度加投',
    hook: '七夕礼盒 · 中式浪漫 · 可刻字 · 今年七夕送这个' },
  { sortKey: '08-25', tier: 'A',
    date: '8月下旬 – 9月上旬',
    name: '开学季',
    feature: '学生和家长的集中采购期，清单式购买特征明显 —— 一次买十几样，套装和清单型内容转化最好',
    category: '文具 · 学生数码 · 宿舍好物 · 收纳 · 书包 · 护眼灯 · 小家电',
    action: '备货按日销 3–5 倍，套装组合单独备；做「开学清单」「宿舍必备十件」这类合集内容；开学专属券 + 满减凑单；适度加投打清单型搜索词',
    hook: '开学清单 · 宿舍必备 · 一次买齐 · 学生认证优惠' },
  { sortKey: '09-09', tier: 'A',
    date: '9月上旬',
    name: '99 划算节',
    feature: '淘系在双11前的官方练兵档期，折扣心智明确但热度有限；真正价值是测双11主推款、积累加购人群',
    category: '日百快消 · 家清 · 食品 · 中低客单标品',
    action: '备货按日销 3–4 倍；报名会场拿官方流量；用这次数据筛双11主推 SKU；小额券 + 少量 KOC；中等加投',
    hook: '99划算节 · 划算价 · 加购锁定双11价' },
  { sortKey: '09-17', tier: 'A',
    date: '农历八月十五',
    name: '中秋节',
    feature: '礼赠属性极强，而且是全年唯一「企业团购」占比显著的节点 —— B端订单要单独开口子接',
    category: '月饼礼盒 · 茶酒 · 坚果礼盒 · 保健品 · 家清礼盒 · 企业团购定制',
    action: '备货按日销 4–6 倍，礼盒装单独备并预留团购量；提前 20 天铺送礼场景内容，单独开企业团购咨询入口；专属券 + 团购阶梯价；少量达人 + 适度加投',
    hook: '中秋礼盒 · 送客户不失礼 · 企业团购可开票 · 满2件包邮' },
  { sortKey: '10-01', tier: 'A',
    date: '10月1日 – 7日',
    name: '国庆黄金周',
    feature: '出游和婚庆双高峰，也是双11预售前最后一个独立节点 —— 10月中旬起流量就被双11抽走了',
    category: '旅行出行 · 户外 · 相机数码 · 婚庆用品 · 车载 · 秋冬服饰上新',
    action: '备货按日销 3–4 倍；做出行和婚庆两条内容线；假期券 + 直播间专享；适度加投，并同步启动双11蓄水加购',
    hook: '国庆出行清单 · 长假必备 · 加购享双11预售价' },
  { sortKey: '11-11', tier: 'S',
    date: '10月中下旬预售 – 11月11日 – 11月中返场',
    name: '双十一',
    feature: '全年最大促，战线接近一个月，是 S 级里的 S 级；用户比价最理性、最看重「历史最低价」承诺 —— 价格穿刺一次就毁掉整年信任',
    category: '全品类；高客单和大件的年度成交高峰',
    action: '备货按日销 12–20 倍，并按预售定金数据分批追单；提前 45 天报会场、锁达人、备素材；预售期全力冲定金和加购，开门红两小时定全场基调；50+ KOC 全矩阵 + 5 场以上达人直播；千川/引力魔方/万相台放量 200–400%；预售→开门红→返场三段独立核算；提前公布价保规则',
    hook: '双11开门红 · 全年最低价 · 定金翻倍 · 价保30天 · 跨店满300减50' },
  { sortKey: '12-12', tier: 'A',
    date: '12月12日',
    name: '双十二',
    feature: '双11的返场补漏，用户已被榨过一轮，力度不如双11但清尾货效率高；中小商家反而比双11好打（大品牌注意力已经撤了）',
    category: '双11尾货 · 冬季刚需（保暖/家清）· 年前礼赠预热',
    action: '备货按日销 3–5 倍，以清双11尾货为主；主打「双11没抢到」的补偿型内容；小额券 + 尾货清仓价；中等加投',
    hook: '双11没抢到的 · 年前清仓 · 最后一波' },
  { sortKey: '12-25', tier: 'B',
    date: '12月25日',
    name: '圣诞节',
    feature: '国内以氛围和年轻社交属性为主，实际成交贡献有限；真正的价值是给元旦和年货节的内容做预热铺垫',
    category: '氛围装饰 · 礼盒 · 美妆 · 甜品 · 冬季服饰',
    action: '备货不变；只做氛围内容和封面换新，顺势预告年货节；0 预算不加投',
    hook: '圣诞氛围感 · 交换礼物 · 年货节预告' }
];

// ============ 参考页 · 电商运营指标 ============
// 基准值全部换成国内平台的量级（千川 CPC、抖音商城 CVR、公众号打开率…）。
// 需求 19 说"如果国内海外指标一致就不改，有更适配国内的就改" ——
// 指标本身（CTR/CVR/ROI/AOV）是通用的，所以指标名和层级不动；
// 但 bench 那列必须换：'TikTok 美国 $0.3–1.0' 对国内运营没有任何参考价值。
//
// 两处是真的换了指标而不只是换数字：
//  · CPS 联盟分成 → 达人分销佣金率。国内没有"联盟营销"这个说法，
//    对应的是精选联盟/星图的达人佣金，而且佣金率是商家自己设的，
//    它是个决策变量，不是被动观测值 —— trap 那列按这个改了。
//  · 私域打开率的 bench 从"邮件 30–50%"换成"公众号 2–5% / 企微社群
//    20–40%"。国内私域根本不走邮件，邮件那个数字照抄会误导人按
//    邮件的思路做私域。
var ECOM_METRICS = [
  { layerKey: 'traffic', abbr: 'CTR',
    layer: '流量层（看触达）',
    name: '点击率',
    bench: '抖音信息流 1–3% · 千川素材 2–4% · 小红书笔记 3–8%',
    good: '信息流 > 3% · 小红书笔记 > 8%',
    watch: '封面与前 3 秒钩子的强度',
    trap: '高 CTR 不等于高转化，必须和 CVR 联动看；标题党能把 CTR 拉起来，但会同时拉低完播和成交' },
  { layerKey: 'traffic', abbr: 'CPC',
    layer: '流量层（看触达）',
    name: '单次点击成本',
    bench: '千川 ¥0.3–1.5 · 小红书薯条 ¥0.5–2.0',
    good: '越低越好，但要看点击质量',
    watch: '出价竞争度 / 人群包匹配度',
    trap: '别只追 CPC 低 —— 便宜的点击往往来自泛人群。要看 CTR × CVR 的乘积和扣完退货的真实 ROI' },
  { layerKey: 'convert', abbr: 'CVR',
    layer: '转化层（看效率）',
    name: '支付转化率',
    bench: '抖音商城 1–3% · 小红书店铺 2–5% · 天猫搜索流量 3–8%',
    good: '内容流量 3%+ · 搜索流量 5%+',
    watch: '详情页与内容承诺是否一致 / 信任链（评价、销量、资质）',
    trap: '搜索流量的 CVR 天然是推荐流量的 2–3 倍，两者混在一起算会得出完全错误的结论' },
  { layerKey: 'convert', abbr: 'AOV',
    layer: '转化层（看效率）',
    name: '客单价',
    bench: '拼多多 ¥50–150 · 抖音 ¥80–300 · 天猫 ¥150–500',
    good: '越高越好，但必须和退货率一起看',
    watch: '凑单结构 / 组合装设计 / 满减档位',
    trap: '满减凑单能把 AOV 拉高，但凑单件的退货率也最高 —— 虚高的 AOV 会掩盖真实利润' },
  { layerKey: 'return', abbr: 'ROI',
    layer: '回报层（看赚钱）',
    name: '广告投产比',
    bench: '千川目标 ROI 2–4 · 成熟店铺 3–6',
    good: '越高越好，但要能覆盖佣金 + 退货 + 履约',
    watch: '投放效率 / 自然流量与付费流量的配比',
    trap: '平台后台的 ROI 通常是「成交金额 ÷ 消耗」，没扣退货和达人佣金 —— 拿它当利润率会真的亏钱' },
  { layerKey: 'return', abbr: '佣金率',
    layer: '回报层（看赚钱）',
    name: '达人分销佣金率',
    bench: '精选联盟通常 10–30% · 高毛利美妆 20–40%',
    good: '在毛利允许范围内越高越有推力',
    watch: '达人生态健康度 / 出单达人的集中度',
    trap: '低于 10% 达人不接，高于 30% 要先算清毛利。只看 GMV 不看扣完佣金后的净利，是最常见的自嗨' },
  { layerKey: 'retain', abbr: '打开率',
    layer: '留存层（看复利）',
    name: '私域打开率',
    bench: '公众号 2–5% · 小程序推送 10–20% · 企微社群 20–40%',
    good: '公众号 > 5% · 社群 > 30%',
    watch: '标题与推送时段 · 复购引擎是否真的在转',
    trap: '公众号打开率逐年下滑是行业趋势，别拿三年前的 15% 当基准；社群打开率高但骚扰阈值低，频次一过就退群' },
  { layerKey: 'retain', abbr: '产能',
    layer: '留存层（看复利）',
    name: '内容产能',
    bench: 'AI 辅助 1 人 1 小时 30 条 vs 外包 ¥50–150/条',
    good: '越快越省，但要保住合格率',
    watch: 'SOP 成熟度 / AI 工具渗透率 / 素材复用率',
    trap: '别只追量 —— 同质化素材会被判重限流。产能必须和素材差异度、完播率一起看' }
];

var METRIC_CALIBERS = [
  { dim: '订单',
    rule: '支付成功 = 1 单，剔除取消、未付款、已退款',
    wrong: '把「下单」甚至「加购」也算成订单' },
  { dim: '销售额',
    rule: '按实付金额统计，并把 GMV 和「扣退货后的净成交」分成两列列出',
    wrong: '拿没扣退货的 GMV 去汇报利润' },
  { dim: '归因窗口',
    rule: '全渠道统一 7 天点击 + 1 天浏览',
    wrong: '千川 7 天和小红书 15 天的口径直接相加' },
  { dim: '流量来源',
    rule: '抖音用星图任务 ID、小红书用蒲公英合作 ID、站外统一打 UTM',
    wrong: '凭感觉判断哪部分是自然流量、哪部分是付费带来的' },
  { dim: '退货率',
    rule: '按「退款完成时间」而不是下单时间归期，服饰类必须单独列',
    wrong: '只看当月退货率，跨月退货把上个月的数据悄悄吃掉了' }
];

var CVR_VERSIONS = [
  { ver: '广义 CVR', formula: '80 / 1000', result: '8.0%',
    use: '看兴趣度（偏内容侧）· 内容团队爱看这个' },
  { ver: '下单 CVR', formula: '30 / 1000', result: '3.0%',
    use: '看购买意向 · 运营团队爱看这个' },
  { ver: '支付 CVR（行业标准）', formula: '12 / 1000', result: '1.2%',
    use: '看真实成交 · 老板和财务只认这个' }
];

var METRIC_CASES = [
  { scene: '千川投流',
    pain: 'CTR 5% 但 GMV 为 0',
    wrong: '看 CTR 高就直接加预算',
    right: '查支付 CVR 只有 0.2%，判定是详情页和视频里的承诺不一致',
    result: '重做详情页后 ROI 从 0.5 → 2.8' },
  { scene: '达人分销',
    pain: '寄样 50 个达人，0 出单',
    wrong: '统一佣金率群发寄样，没做任何专属追踪',
    right: '每位达人独立星图任务 ID + 专属直播间价，出单可归因',
    result: '7 天识别出 3 个真能出单的达人，佣金预算集中投放' },
  { scene: '私域复购',
    pain: '公众号群发打开率只有 2%',
    wrong: '拿产品图当封面，固定每周五晚推送',
    right: 'A/B 测试标题 + 按用户活跃时段分批推 + 同步企微社群',
    result: '打开率 2% → 6%，社群到店转化提升 3 倍' }
];

function renderHolidays() {
  var body = document.getElementById('holidaysBody');
  if (!body) return;
  function L(f) { return (typeof f === 'object' && f) ? f.zh : f; }
  var html = '';
  for (var i = 0; i < CN_MARKETING_HOLIDAYS.length; i++) {
    var h = CN_MARKETING_HOLIDAYS[i];
    html += '<tr>'
      + '<td style="white-space:nowrap;color:var(--text-secondary);">' + _refEsc(L(h.date)) + '</td>'
      + '<td style="font-weight:600;min-width:150px;">' + _refEsc(L(h.name)) + '</td>'
      + '<td style="text-align:center;"><span class="tier-badge tier-' + _refEsc(h.tier) + '">' + _refEsc(h.tier) + '</span></td>'
      + '<td>' + _refEsc(L(h.feature)) + '</td>'
      + '<td>' + _refEsc(L(h.category)) + '</td>'
      + '<td>' + _refEsc(L(h.action)) + '</td>'
      + '<td style="color:var(--accent-light);font-size:12px;">' + _refEsc(L(h.hook)) + '</td>'
      + '</tr>';
  }
  body.innerHTML = html;
}

function renderMetrics() {
  function L(f) { return (typeof f === 'object' && f) ? f.zh : f; }

  var body = document.getElementById('metricsBody');
  if (body) {
    var html = '';
    for (var i = 0; i < ECOM_METRICS.length; i++) {
      var m = ECOM_METRICS[i];
      html += '<tr>'
        + '<td><span class="layer-badge layer-' + _refEsc(m.layerKey) + '">' + _refEsc(L(m.layer)) + '</span></td>'
        + '<td style="font-weight:600;white-space:nowrap;">' + _refEsc(L(m.name)) + '</td>'
        + '<td style="font-family:Consolas,monospace;white-space:nowrap;color:var(--accent-light);">' + _refEsc(m.abbr) + '</td>'
        + '<td>' + _refEsc(L(m.bench)) + '</td>'
        + '<td style="white-space:nowrap;font-weight:600;">' + _refEsc(L(m.good)) + '</td>'
        + '<td>' + _refEsc(L(m.watch)) + '</td>'
        + '<td style="color:var(--text-secondary);font-size:12px;">' + _refEsc(L(m.trap)) + '</td>'
        + '</tr>';
    }
    body.innerHTML = html;
  }

  var cal = document.getElementById('caliberBody');
  if (cal) {
    var h2 = '';
    for (var j = 0; j < METRIC_CALIBERS.length; j++) {
      var c = METRIC_CALIBERS[j];
      h2 += '<tr>'
        + '<td style="font-weight:600;white-space:nowrap;">' + _refEsc(L(c.dim)) + '</td>'
        + '<td>' + _refEsc(L(c.rule)) + '</td>'
        + '<td style="color:#f87171;">' + _refEsc(L(c.wrong)) + '</td>'
        + '</tr>';
    }
    cal.innerHTML = h2;
  }

  var c3 = document.getElementById('cvr3Body');
  if (c3) {
    var h3 = '';
    for (var k = 0; k < CVR_VERSIONS.length; k++) {
      var v = CVR_VERSIONS[k];
      h3 += '<tr>'
        + '<td style="font-weight:600;white-space:nowrap;">' + _refEsc(L(v.ver)) + '</td>'
        + '<td style="font-family:Consolas,monospace;">' + _refEsc(v.formula) + '</td>'
        + '<td style="font-weight:700;color:var(--accent-light);">' + _refEsc(v.result) + '</td>'
        + '<td>' + _refEsc(L(v.use)) + '</td>'
        + '</tr>';
    }
    c3.innerHTML = h3;
  }

  var cs = document.getElementById('metricCasesBody');
  if (cs) {
    var h4 = '';
    for (var n = 0; n < METRIC_CASES.length; n++) {
      var s = METRIC_CASES[n];
      h4 += '<tr>'
        + '<td style="font-weight:600;white-space:nowrap;">' + _refEsc(L(s.scene)) + '</td>'
        + '<td>' + _refEsc(L(s.pain)) + '</td>'
        + '<td style="color:#f87171;">' + _refEsc(L(s.wrong)) + '</td>'
        + '<td style="color:#34d399;">' + _refEsc(L(s.right)) + '</td>'
        + '<td style="font-weight:600;">' + _refEsc(L(s.result)) + '</td>'
        + '</tr>';
    }
    cs.innerHTML = h4;
  }
}

// ============ 大模型选购 · 采购清单 ============
// 排序即产品逻辑：数组顺序就是页面顺序，按性价比 免费 → 费用低 → 费用中 → 费用高。
// 不做 sort()，直接把数组按档位写好 —— 同档位内的先后是人工判断的推荐度，
// 用 sort 会把这层判断抹掉（同档 key 相等，顺序变成引擎实现细节）。
//
// tier: free | low | mid | high  → 决定徽章颜色（见 .price-badge）
// modal: [文本, 图像, 视频, 语音] 四个布尔，渲染成 4 个 chip，比一句描述更好扫
//
// 全部是国内厂商，加一家新加坡 AGNES（免费全模态网关，用户点名保留）。
// 原来这里有 OpenAI / Anthropic / Google / Sora / Runway 五家海外的，已删。
// 删完 mid 档会空掉（那三条全是海外），所以按同一套档位语义补了国内的中价档
// —— 空档位比留海外模型更难看：档位说明卡片还讲着"费用中·质量兜底"，
// 表里一条没有，用户会以为页面没加载完。
//
// ⚠️ 本页所有字段都不含 API Key。AGNES 文档里那个 sk-... 是真实可用的 key，
//    这页是所有登录用户可见的，写进去等于公开泄露 —— 只放申请入口链接。
// ⚠️ 字段是纯字符串不是 {zh,en}：站内只有中文，双语字段等于每条写两遍
//    只显示一半，是前面几个任务反复"只改了一半"的来源。
var MODEL_SHOPPING_LIST = [
  { tier: 'free',
    name: 'AGNES AI · agnes-2.5-flash',
    vendor: 'Agnes AI · 新加坡',
    modal: [true, true, true, false],
    price: '免费（有额度/限流）',
    buy: 'https://agnes-ai.com/',
    doc: 'https://agnes-ai.com/doc/overview',
    pros: '全模态免费：文本 + 图像 + 视频一个网关搞定；OpenAI 兼容协议，任何支持自定义端点的工具直接接；无需信用卡即可起步',
    cons: '免费额度和并发有限，无 SLA，不适合做生产主力；图像/视频不走 chat 端点，要自己封装；视频任务异步，需轮询状态' },

  { tier: 'free',
    name: '硅基流动 SiliconCloud',
    vendor: '硅基流动 · 中国',
    modal: [true, true, true, true],
    price: '新用户赠送额度；多个小参数模型长期免费；付费按量',
    buy: 'https://cloud.siliconflow.cn/',
    doc: 'https://docs.siliconflow.cn/',
    pros: '一个 key 聚合几十个国内开源模型（Qwen / GLM / DeepSeek / 各家生图），换模型只改 model 字段不改代码；OpenAI 兼容；适合做降级链的兜底层',
    cons: '它是聚合网关不是模型厂商，稳定性受上游影响；免费模型多为小参数版，质量不能对标旗舰；限流比直连原厂更紧' },

  { tier: 'low',
    name: '火山方舟 · 豆包 Doubao（Seed / Seedream）',
    vendor: '字节跳动 · 中国',
    modal: [true, true, true, true],
    price: '文本约 ¥0.8–8 / 百万 tokens；图片约 ¥0.2–0.3 / 张；新用户有免费额度',
    buy: 'https://console.volcengine.com/ark',
    doc: 'https://www.volcengine.com/docs/82379',
    pros: '本站图片主力就是它的 Seedream：出图快、分辨率高（2K+）、中文提示词理解好；文本、图片、视频同一套 key；国内直连低延迟、有发票；抖音生态语感最贴（同一家做的）',
    cons: '模型 ID 带日期后缀，厂商换代要手动改配置，不改会静默降级到旧版；图片按张计费、文本按 token 计费，两套口径要分开算账，混在一起看会低估配图成本' },

  { tier: 'low',
    name: '阿里云百炼 · 通义千问 Qwen',
    vendor: '阿里巴巴 · 中国',
    modal: [true, true, true, true],
    price: '文本约 ¥0.3–20 / 百万 tokens（分档很细）；新用户各模型均送免费 tokens',
    buy: 'https://bailian.console.aliyun.com/',
    doc: 'https://help.aliyun.com/zh/model-studio/',
    pros: '型号谱最全（从超便宜的 turbo 到 max），可按场景精确配价；开源权重可自建；文档和 SDK 成熟；万相系列出图质量稳定；淘系电商语境理解好',
    cons: '控制台概念多（应用/模型/知识库），首次上手成本高；不同模型限流策略不一致，需逐个压测' },

  { tier: 'low',
    name: 'DeepSeek 开放平台',
    vendor: '深度求索 · 中国',
    modal: [true, false, false, false],
    price: '约 ¥1–8 / 百万 tokens，命中缓存更低；业内最便宜的一档之一',
    buy: 'https://platform.deepseek.com/',
    doc: 'https://api-docs.deepseek.com/',
    pros: '价格极低且有上下文缓存折扣，适合大批量生成商品文案/标题；推理版逻辑强，适合做爆款拆解这类分析任务；OpenAI 兼容，替换成本近零',
    cons: '纯文本，没有图片/视频能力，配图必须另找模型；高峰期偶有排队；不做多模态就无法一站式' },

  { tier: 'low',
    name: '智谱 BigModel · GLM',
    vendor: '智谱 AI · 中国',
    modal: [true, true, true, false],
    price: 'GLM-4-Flash 系列免费/极低价；主力型号约 ¥1–50 / 百万 tokens',
    buy: 'https://open.bigmodel.cn/',
    doc: 'https://open.bigmodel.cn/dev/api',
    pros: 'Flash 档基本等于免费，适合做高频小任务（改标题、提炼卖点、生成话题标签）；CogVideoX 视频模型可直接用；有国内企业级合规支持',
    cons: '免费档限流明显，量产要升到付费型号；视频时长和分辨率有限制；同名模型不同版本能力差异大，要盯准型号后缀' },

  { tier: 'low',
    name: 'MiniMax 开放平台（海螺）',
    vendor: 'MiniMax · 中国',
    modal: [true, true, true, true],
    price: '文本约 ¥1–30 / 百万 tokens；视频按秒/按次计费；有 Token Plan 包月',
    buy: 'https://platform.minimaxi.com/',
    doc: 'https://platform.minimaxi.com/document',
    pros: '语音合成和视频（海螺）是强项，适合做口播短视频；文本+语音+视频一站式；本站已内置其协议',
    cons: '包月 Token Plan 用超会直接报「已达用量上限」（错误码 2056）导致全链路不可用，务必配好告警和降级；视频成本明显高于文本' },

  { tier: 'low',
    name: '月之暗面 · Kimi',
    vendor: 'Moonshot AI · 中国',
    modal: [true, true, false, false],
    price: '约 ¥2–60 / 百万 tokens（按上下文长度分档）；新用户有赠送额度',
    buy: 'https://platform.moonshot.cn/',
    doc: 'https://platform.moonshot.cn/docs',
    pros: '超长上下文是招牌：可以把一整份竞品调研、几十条评论、整页商品详情一次喂进去做总结；中文长文行文流畅，适合写公众号深度稿；OpenAI 兼容',
    cons: '长上下文按长度分档计价，一次塞太多会明显变贵，要先裁剪再喂；不生成视频；纯文本任务的单价高于 DeepSeek' },

  { tier: 'mid',
    name: '百度智能云千帆 · 文心 ERNIE',
    vendor: '百度 · 中国',
    modal: [true, true, true, true],
    price: '主力型号约 ¥2–120 / 百万 tokens（旗舰档明显更高）；有免费试用额度',
    buy: 'https://console.bce.baidu.com/qianfan/',
    doc: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/index.html',
    pros: '搜索语料喂出来的中文常识和时事把握稳，写百家号/知乎这类要被搜索收录的内容有天然优势；企业级合规与私有化部署方案齐全；平台上还能调其他厂商模型',
    cons: '旗舰型号单价接近国内天花板，不适合日更量产；控制台流程偏企业化，个人开发者上手比豆包/DeepSeek 慢；型号命名换代频繁' },

  { tier: 'mid',
    name: '腾讯混元 Hunyuan',
    vendor: '腾讯 · 中国',
    modal: [true, true, true, false],
    price: '文本约 ¥1–100 / 百万 tokens；生图按张计费；有免费额度',
    buy: 'https://cloud.tencent.com/product/hunyuan',
    doc: 'https://cloud.tencent.com/document/product/1729',
    pros: '和微信生态贴得最近，写公众号/视频号的调性把握好；生图的中文海报和文字排版能力强于多数同价位模型；腾讯云上和其他云服务打通',
    cons: '端点路径调整过（本站的腾讯图片端点就因此 404 过一次），升级要盯公告；中高档单价偏高；开发者社区资料比阿里/字节少' },

  { tier: 'mid',
    name: '阶跃星辰 Step',
    vendor: 'StepFun · 中国',
    modal: [true, true, true, true],
    price: '文本约 ¥5–100 / 百万 tokens（按型号）；多模态型号单独计价',
    buy: 'https://platform.stepfun.com/',
    doc: 'https://platform.stepfun.com/docs/overview/concept',
    pros: '多模态理解是强项：丢一张商品详情长图进去能直接读出卖点和参数，做情报抓取的兜底解析很合适；图文混合输入的稳定性好于纯文本模型硬转',
    cons: '生态和文档不如头部几家丰富；价格高于同定位的 Qwen / GLM；型号迭代快，能力和限流都要重新压测' },

  { tier: 'high',
    name: '快手可灵 · 可灵 AI（视频专业档）',
    vendor: '快手 · 中国',
    modal: [false, true, true, false],
    price: '会员约 ¥66–666/月（积分制）；API 按生成时长/分辨率扣费',
    buy: 'https://klingai.kuaishou.com/',
    doc: 'https://app.klingai.com/cn/dev/document-api',
    pros: '国内视频模型第一梯队：图生视频、运镜控制、首尾帧、局部重绘都有，可控性远强于通用大模型；国内直连、支付和开票方便；人物一致性可用参考图锁定',
    cons: '积分制容易超支 —— 上线前必须按月产量估算，高清和长视频扣分极快；生成是分钟级异步任务，前端要留足超时；风格一致性靠参考图硬维持，换镜头容易漂' },

  { tier: 'high',
    name: '生数科技 Vidu',
    vendor: '生数科技 · 中国',
    modal: [false, true, true, false],
    price: '会员约 ¥¥数十至数百/月（积分制）；API 按次/按时长计费',
    buy: 'https://www.vidu.cn/',
    doc: 'https://platform.vidu.cn/docs',
    pros: '主体参考（多图锁定同一人物/产品）是它最实用的能力，适合做同一个模特或同一件商品的系列短视频；语义理解偏中文场景，不用把提示词翻成英文',
    cons: '单条成本远高于图文，不适合日更；生成时长和分辨率有上限；商用授权与人物肖像的条款要逐条确认，尤其是用真人参考图的场景' }
];

// 接入失败排查。来自 AGNES 文档的排查清单 + 本站实际踩过的坑（2056 配额、端点 404）。
// 同样拍平成纯字符串。
var MODEL_SHOP_TROUBLE = [
  { sym: '文本模型无响应 / 连接超时',
    cause: 'Base URL 写错，或少了 /v1 这一段',
    fix: '逐字符核对 Base URL（AGNES 是 https://apihub.agnes-ai.com/v1），再确认 API Key 有效' },
  { sym: '模型列表里看不到目标模型',
    cause: '模型 ID 拼写或大小写不对 —— 模型 ID 通常区分大小写',
    fix: '直接从厂商平台复制模型名（如 agnes-2.0-flash、doubao-seed-1-6），不要手打' },
  { sym: '鉴权失败 / 401 / 403',
    cause: 'Key 失效、账户余额或 credits 不足、Key 未授权该模型',
    fix: '到控制台确认余额与该 Key 的模型权限，必要时重新生成 Key' },
  { sym: '报「已达到用量上限」（如 MiniMax 错误码 2056）',
    cause: '包月 Token Plan 用超，整个 key 被停用，所有下游功能一起挂',
    fix: '充值或升级套餐；同时在应用里配好多模型降级链，不要单点依赖一家' },
  { sym: '端点返回 404 page not found',
    cause: '厂商废弃了旧端点路径（本站的腾讯 tokenhub 图片端点就这么挂的）',
    fix: '对照最新官方文档更新路径，并把已废弃的模型从降级链里摘掉，省掉每次几秒的无效重试' },
  { sym: '视频任务长时间没结果',
    cause: '视频是异步任务，提交后返回的是 task id，不是视频',
    fix: '按文档轮询任务状态，拿到 status=success 后再取视频 URL；前端要给足超时时间' },
  { sym: '模型 ID 昨天还能用，今天突然不认',
    cause: '厂商下线了带日期后缀的旧快照版本（豆包、文心、Step 都这么干过）',
    fix: '订阅厂商变更公告；配置里别写死单一快照 ID，降级链至少留两个可用型号' }
];

function renderModelShop() {
  // L() 保留兼容 {zh,en}：数据已拍平成纯字符串，万一以后哪条又塞回对象
  // 也不会渲染出 [object Object]。
  function L(f) { return (typeof f === 'object' && f) ? f.zh : f; }
  var TIER_LABEL = { free: '免费', low: '费用低', mid: '费用中', high: '费用高' };
  // 四种模态的短标签。用 chip 而不是 ✓/✗ 表格：列会爆宽，而且 ✗ 那一格用户读不出"什么不支持"
  var MODAL_LABEL = ['文', '图', '视', '音'];

  var body = document.getElementById('modelShopBody');
  if (body) {
    var html = '';
    for (var i = 0; i < MODEL_SHOPPING_LIST.length; i++) {
      var m = MODEL_SHOPPING_LIST[i];
      var chips = '';
      for (var c = 0; c < 4; c++) {
        chips += '<span class="modal-chip' + (m.modal[c] ? ' on' : '') + '">' + MODAL_LABEL[c] + '</span>';
      }
      html += '<tr>'
        + '<td style="text-align:center;"><span class="price-badge price-' + _refEsc(m.tier) + '">' + _refEsc(TIER_LABEL[m.tier]) + '</span></td>'
        + '<td style="font-weight:600;min-width:150px;">' + _refEsc(L(m.name)) + '</td>'
        + '<td style="white-space:nowrap;color:var(--text-secondary);">' + _refEsc(L(m.vendor)) + '</td>'
        + '<td style="white-space:nowrap;">' + chips + '</td>'
        + '<td style="min-width:150px;">' + _refEsc(L(m.price)) + '</td>'
        + '<td><a href="' + safeUrl(m.buy) + '" target="_blank" rel="noopener noreferrer" style="white-space:nowrap;">'
          + _refEsc(String(m.buy).replace(/^https?:\/\//, '').replace(/\/$/, '')) + ' ↗</a></td>'
        + '<td style="color:#34d399;">' + _refEsc(L(m.pros)) + '</td>'
        + '<td style="color:var(--text-secondary);font-size:12px;">' + _refEsc(L(m.cons)) + '</td>'
        + '<td><a href="' + safeUrl(m.doc) + '" target="_blank" rel="noopener noreferrer" style="white-space:nowrap;">'
          + '接入文档 ↗</a></td>'
        + '</tr>';
    }
    body.innerHTML = html;
  }

  var tb = document.getElementById('msTroubleBody');
  if (tb) {
    var h2 = '';
    for (var j = 0; j < MODEL_SHOP_TROUBLE.length; j++) {
      var t2 = MODEL_SHOP_TROUBLE[j];
      h2 += '<tr>'
        + '<td style="font-weight:600;min-width:170px;">' + _refEsc(L(t2.sym)) + '</td>'
        + '<td style="color:#f87171;">' + _refEsc(L(t2.cause)) + '</td>'
        + '<td style="color:#34d399;">' + _refEsc(L(t2.fix)) + '</td>'
        + '</tr>';
    }
    tb.innerHTML = h2;
  }
}

// 初始化渲染（与 i18n 无关，语言切换由上方 hook 重渲）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { renderCommercePlatforms(); renderSocialPlatforms(); renderHolidays(); renderMetrics(); renderModelShop(); });
} else {
  setTimeout(function() { renderCommercePlatforms(); renderSocialPlatforms(); renderHolidays(); renderMetrics(); renderModelShop(); }, 0);
}


async function optimizeImagePrompt() {
  var input = document.getElementById('imagePromptInput');
  var btn = document.getElementById('btnOptimizeImagePrompt');
  var hint = document.getElementById('imagePromptOptimizeHint');
  if (!input) return;
  var raw = input.value.trim();
  if (!raw) { showToast('请先输入图片主题或简单描述'); input.focus(); return; }
  var oldText = btn ? btn.innerHTML : '';
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '优化中...'; }
    if (hint) hint.textContent = (modelNameById(getPickedModelId('image-prompt')) || '大模型') + ' 正在优化图片提示词...';
    var systemPrompt = '你是国内头部电商与自媒体的商业视觉创意总监，同时精通 AI 生图提示词。把用户给的简单主题扩写成一条专业的生图提示词。只输出这条提示词本身，用简体中文，不要解释、不要标题、不要 markdown。必须覆盖：主体、场景、构图、镜头与取景、光线、色调、材质细节、风格、画质、画幅、商业用途。画面内如需文字一律简体中文。内容要合规、适合品牌投放。';
    var userPrompt = '用户主题：' + raw + '\n\n请产出一条专业级中文生图提示词，120-260 字，可直接用于电商主图 / 种草配图 / 社媒广告 / 封面图。';
    // 用 image-prompt（文本模块）而不是 image（图片模块）—— 优化提示词是文本活儿，
    // 拿图片模型的下拉值去调文本接口必然对不上。
    var optimized = (await callModuleText('image-prompt', systemPrompt, userPrompt) || '').trim();
    if (!optimized) throw new Error('模型未返回优化结果');
    input.value = optimized.replace(/^(prompt|提示词)[：:]\s*/i, '').trim();
    input.focus();
    if (hint) hint.textContent = '已优化完成，可继续生成图片';
    showToast('✅ 图片提示词已优化（' + (modelNameById(getPickedModelId('image-prompt')) || '') + '）');
  } catch (e) {
    console.error('[OptimizeImagePrompt]', e);
    if (hint) hint.textContent = '优化失败，可稍后重试或换一个文本模型';
    showToast('⚠️ 提示词优化失败: ' + ((e && e.message) || '未知错误'));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText || 'AI优化提示词'; }
  }
}

function isValidGeneratedMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  var u = url.trim();
  if (!u || u === '#' || u.indexOf('about:') === 0 || u.indexOf('javascript:') === 0) return false;
  return /^(https?:|blob:|data:video\/|data:image\/)/i.test(u);
}

function normalizeTaskState(raw) {
  var s = String(raw || '').toLowerCase();
  if (['completed', 'complete', 'success', 'succeeded', 'finished', 'done'].indexOf(s) !== -1) return 'completed';
  if (['failed', 'fail', 'error', 'cancelled', 'canceled'].indexOf(s) !== -1) return 'failed';
  if (['running', 'processing', 'pending', 'queued', 'submitted', 'created', 'in_progress', 'waiting', 'generating', 'starting'].indexOf(s) !== -1) return 'processing';
  return s || 'processing';
}

function findFirstVideoUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    var s = value.trim();
    return /^(https?:|blob:|data:video\/)/i.test(s) ? s : '';
  }
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      var fromArr = findFirstVideoUrl(value[i]);
      if (fromArr) return fromArr;
    }
    return '';
  }
  if (typeof value === 'object') {
    var keys = ['videoUrl', 'video_url', 'url', 'downloadUrl', 'download_url', 'fileUrl', 'file_url', 'mediaUrl', 'media_url'];
    for (var k = 0; k < keys.length; k++) {
      var fromKey = findFirstVideoUrl(value[keys[k]]);
      if (fromKey) return fromKey;
    }
    var nested = ['resultUrls', 'result_urls', 'urls', 'videos', 'video', 'output', 'outputs', 'result', 'results', 'data', 'metadata', 'meta'];
    for (var n = 0; n < nested.length; n++) {
      var fromNested = findFirstVideoUrl(value[nested[n]]);
      if (fromNested) return fromNested;
    }
  }
  return '';
}

function getTaskIdFromResponse(data) {
  if (!data || typeof data !== 'object') return '';
  return data.taskId || data.task_id || data.id || data.request_id || (data.data && (data.data.taskId || data.data.task_id || data.data.id)) || '';
}

function getTaskStateFromResponse(data) {
  if (!data || typeof data !== 'object') return 'processing';
  var raw = data.state || data.status || data.taskStatus || data.task_status || (data.data && (data.data.state || data.data.status || data.data.taskStatus || data.data.task_status));
  return normalizeTaskState(raw);
}

function getTaskErrorFromResponse(data) {
  if (!data) return '未知错误';
  var err = data.error || data.message || data.msg || (data.data && (data.data.error || data.data.message || data.data.msg));
  if (!err) return '未知错误';
  return typeof err === 'string' ? err : (err.message || JSON.stringify(err));
}

async function generateImages() {
  var promptRaw = document.getElementById('imagePromptInput').value.trim();
  if (!promptRaw) { showToast('请输入图片描述'); return; }
  var num = parseInt(document.getElementById('imageNumInput').value, 10) || 3;
  num = Math.max(1, Math.min(6, num));

  var loading = document.getElementById('imageLoading');
  var resultSection = document.getElementById('imageResultSection');
  var btn = document.getElementById('btnGenerateImage');

  // 增量生成：不清除旧图片
  document.getElementById('imageResultGrid').innerHTML = '';
  loading.style.display = 'block';
  resultSection.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 生成中...';

  // 滚到加载动画上。单页导航下用户已经站在本页，原来滚 section-image
  // 顶部等于把人从刚点的按钮那儿拽回页首 —— 该看的是结果区。
  setTimeout(function() {
    var _ld = document.getElementById('imageLoading');
    if (_ld) _ld.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 200);

  // 追加画面文字约束（中文），详见 ensureCnVisualPrompt
  var prompt = await ensureCnVisualPrompt(promptRaw, 'image');

  var images = [];
  var usedModelId = getPickedModelId('image');
  try {
    // 走统一图片分发器：按下拉框选的图片模型优先，失败自动遍历其它图片模型
    var urls = await callModuleImage('image', prompt, num, imageRefDataUrl);
    if (urls && urls.length > 0) {
      for (var u = 0; u < urls.length; u++) {
        images.push({
          id: 'img_' + Date.now() + '_' + u,
          dataUrl: urls[u],
          prompt: prompt,
          index: u + 1
        });
      }
      showToast('✅ ' + modelNameById(usedModelId) + (imageRefDataUrl ? '（含参考图）' : '') + ' 已生成 ' + images.length + ' 张图片');
    }
  } catch(e) {
    console.log('Image generation API failed:', e && e.message);
  }

  // API 没有返回结果时，用 Canvas 本地兜底；兜底图只做预览，不进入资产库
  var usedFallback = false;
  var previewImages = images;
  if (images.length === 0) {
    previewImages = buildPlaceholderImages(prompt, num);
    usedFallback = true;
  }

  var shortP = prompt.length > 20 ? prompt.substring(0,20)+'…' : prompt;
  if (!usedFallback) {
    // 增量：只有真实生成成功的图片才追加到资产库，不清空旧图片
    for (var i = 0; i < images.length; i++) {
      images[i].date = new Date().toLocaleString();
      images[i].title = 'AI图片 #' + (generatedImages.length + 1) + ' - ' + shortP;
      images[i].platform = modelNameById(usedModelId);
      generatedImages.push(images[i]);
    }
    renderImageResults();
    flushAssets();   // 生成即入库（顺带把远端图落盘）
  } else {
    renderImageResultList(previewImages, true);
  }
  loading.style.display = 'none';
  resultSection.style.display = 'block';
  btn.disabled = false;
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg> 生成图片';
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (usedFallback) {
    showToast('API 暂不可用，已生成本地占位预览，未进入资产库');
  } else {
    showToast('已生成 ' + images.length + ' 张真实图片并加入资产库');
  }
}

// 调用 Agnes AI 图片生成 API（支持参考图）
async function callAgnesImage(prompt, num, refImageUrl) {
  num = Math.max(1, Math.min(6, parseInt(num, 10) || 1));
  var allUrls = [];
  
  // Agnes 图像接口在部分模型上会忽略 n，只返回 1 张；这里按用户数量循环提交，保证选几张就生成几张
  for (var reqIndex = 0; reqIndex < num; reqIndex++) {
    var bodyData = {
      prompt: prompt,
      n: 1,
      size: '1024x1024'
    };
    
    // 如果有参考图，添加到请求中
    if (refImageUrl) {
      bodyData.image = refImageUrl;
      bodyData.image_weight = 0.7; // 参考图权重 0.7，保留 0.3 给提示词
      console.log('🎨 使用参考图生成，权重:', bodyData.image_weight, '第', reqIndex + 1, '/', num, '张');
    }
    
    var resp = await fetch(AGNES_IMAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AGNES_API_KEY
      },
      body: JSON.stringify(bodyData)
    });
    if (!resp.ok) {
      var err = await resp.json().catch(function() { return {}; });
      throw new Error(err.error ? err.error.message : 'HTTP ' + resp.status);
    }
    var data = await resp.json();
    if (data.data && data.data.length > 0) {
      for (var i = 0; i < data.data.length; i++) {
        if (data.data[i].url) allUrls.push(data.data[i].url);
      }
    }
  }
  if (allUrls.length > 0) return allUrls.slice(0, num);
  throw new Error('Agnes AI: No images returned');
}

// 调用火山方舟 Seedream 文生图。
// 这是当前唯一实测可用的图片模型，所以放在降级顺序**第一位**（见 IMAGE_MODEL_BUILTIN 附近）。
// Seedream 不支持 n>1，按张数循环提交，和 callAgnesImage 一个套路。
async function callArkImage(prompt, num, refImageUrl) {
  num = Math.max(1, Math.min(6, parseInt(num, 10) || 1));
  var urls = [];
  var lastErr = null;
  for (var i = 0; i < num; i++) {
    try {
      var body = {
        model: 'doubao-seedream-4-0-250828',
        prompt: prompt,
        size: '2K',
        response_format: 'url',
        watermark: false
      };
      if (refImageUrl) body.image_url = refImageUrl;
      var resp = await fetch(ARK_IMAGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ARK_API_KEY
        },
        body: JSON.stringify(body)
      });
      var data = await resp.json().catch(function() { return {}; });
      if (!resp.ok || data.error) {
        throw new Error((data.error && (data.error.message || data.error.code)) || 'Ark image HTTP ' + resp.status);
      }
      if (data.data && data.data.length) {
        for (var k = 0; k < data.data.length; k++) {
          if (data.data[k].url) urls.push(data.data[k].url);
        }
      }
    } catch (e) {
      // 单张失败不放弃剩下的：拿到 1 张也比 0 张好
      lastErr = e;
      console.warn('[callArkImage] 第 ' + (i + 1) + '/' + num + ' 张失败:', e && e.message);
    }
  }
  if (urls.length) return urls.slice(0, num);
  throw lastErr || new Error('Ark Seedream: No images returned');
}

// 调用腾讯混元图片生成 API
async function callHunyuanImage(prompt, num, refImageUrl) {
  var body = {
    prompt: prompt,
    n: num || 3,
    size: '1024x1024',
    response_format: 'url'
  };
  if (refImageUrl) body.init_image = refImageUrl;
  var resp = await fetch(HY_IMAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + HY_API_KEY
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Hunyuan Image API HTTP ' + resp.status);
  var data = await resp.json();
  if (data.data && data.data.length > 0) {
    return data.data.map(function(d) { return d.url; });
  }
  // 尝试另一种返回格式
  if (data.image_urls && data.image_urls.length > 0) {
    return data.image_urls;
  }
  throw new Error('Hunyuan: No images returned');
}

function buildPlaceholderImages(prompt, num) {
  var images = [];
  var themes = [
    { bg: '#1a1a2e', fg: '#e94560', accent: '#0f3460', name: 'Cyberpunk' },
    { bg: '#0f2027', fg: '#2c5364', accent: '#203a43', name: 'Dark Tech' },
    { bg: '#1c1c1c', fg: '#ff6b35', accent: '#2d2d2d', name: 'Warm Tone' },
    { bg: '#0d1b2a', fg: '#415a77', accent: '#1b263b', name: 'Cool Tone' },
    { bg: '#1a0000', fg: '#e25822', accent: '#3d0000', name: 'Fiery Red' },
    { bg: '#000c18', fg: '#00d2ff', accent: '#001f3f', name: 'Ice Blue' }
  ];
  var shortPrompt = prompt.length > 30 ? prompt.substring(0, 30) : prompt;
  for (var i = 0; i < num; i++) {
    var t = themes[i % themes.length];
    var dataUrl = createCanvasPlaceholder(t.bg, t.accent, t.fg, t.name, shortPrompt, i + 1);
    images.push({
      id: 'img_' + Date.now() + '_' + i,
      dataUrl: dataUrl,
      prompt: prompt,
      index: i + 1,
      title: 'AI图片 #' + (i+1) + ' - ' + shortPrompt
    });
  }
  return images;
}

// 用 Canvas 生成可靠的占位图片（避免 SVG data URL 兼容性问题）
function createCanvasPlaceholder(bgColor, accentColor, fgColor, styleName, promptText, index) {
  var canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 800;
  var ctx = canvas.getContext('2d');

  // 背景渐变
  var grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, bgColor);
  grad.addColorStop(1, accentColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 装饰圆形
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = fgColor;
  ctx.beginPath(); ctx.arc(150, 200, 140, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(650, 550, 200, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(400, 400, 220, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // 中心图标区域
  ctx.fillStyle = fgColor;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(250, 280, 300, 240);
  ctx.globalAlpha = 1;

  // 主文字
  ctx.fillStyle = fgColor;
  ctx.font = 'bold 32px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.globalAlpha = 0.9;
  ctx.fillText('AI Generated', 400, 370);

  // 风格标签
  ctx.font = '20px Arial, sans-serif';
  ctx.globalAlpha = 0.55;
  ctx.fillText(styleName, 400, 410);

  // prompt 摘要
  ctx.font = '16px Arial, sans-serif';
  ctx.globalAlpha = 0.4;
  var lines = wrapText(ctx, promptText, 400);
  for (var l = 0; l < lines.length; l++) {
    ctx.fillText(lines[l], 400, 450 + l * 22);
  }

  // 底部信息
  ctx.font = '14px Arial, sans-serif';
  ctx.globalAlpha = 0.3;
  ctx.fillText('#' + index + ' | 1024x1024 | Placeholder', 400, 750);

  return canvas.toDataURL('image/png');
}

function wrapText(ctx, text, maxWidth) {
  var words = text.split('');
  var lines = [];
  var current = '';
  for (var i = 0; i < words.length; i++) {
    var test = current + words[i];
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = words[i];
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  if (lines.length > 3) lines = lines.slice(0, 3);
  return lines;
}

function renderImageResults() {
  renderImageResultList(generatedImages, false);
}

function renderImageResultList(images, previewOnly) {
  var grid = document.getElementById('imageResultGrid');
  var html = '';
  if (previewOnly) {
    html += '<div class="image-preview-note" style="grid-column:1/-1;">API 暂不可用，以下为本地占位预览，不会进入自媒体资产库。请稍后重试生成真实图片。</div>';
  }
  for (var i = images.length - 1; i >= 0; i--) {
    var img = images[i];
    var assetIndex = generatedImages.indexOf(img);
    html += '<div class="image-result-card">'
      + '<span class="img-index">#' + (img.index || (i + 1)) + '</span>'
      + '<img src="' + img.dataUrl + '" alt="' + escapeHtml(img.prompt || '').substring(0, 50) + '" loading="lazy" />'
      + '<div class="img-actions">';
    if (previewOnly || assetIndex < 0) {
      html += '<button disabled style="opacity:0.65;cursor:not-allowed;">仅预览，未入库</button>';
    } else {
      html += '<button onclick="viewFullImage(' + assetIndex + ')" title="查看大图"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg> 查看大图</button>';
    }
    html += '</div></div>';
  }
  grid.innerHTML = html;
}

function regenerateImages() {
  // 增量重新生成：不清空已有图片，只隐藏结果区让其重新显示
  document.getElementById('imageResultSection').style.display = 'none';
  generateImages();
}

function downloadOneImage(idx) {
  var img = generatedImages[idx];
  if (!img) { showToast('⚠️ 图片不存在'); return; }
  var url = img.dataUrl || img.url || '';
  var filename = 'AI图片_' + (idx + 1) + '.png';
  if (!url) { showToast('⚠️ 图片 ' + (idx + 1) + ' 无有效链接'); return; }

  function doDownload(blobUrl) {
    var a = document.createElement('a');
    a.href = blobUrl || url;
    a.download = filename;
    a.style.display = 'none';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (blobUrl) setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 1000);
  }

  // data URL → 直接下载（不跳转）
  if (url.indexOf('data:') === 0) {
    doDownload(null);
    return;
  }
  // 远程 URL：fetch 为 blob 再下载（避免浏览器打开新标签页）
  var fetchUrl = url;
  if (USE_PROXY && url.indexOf('http') === 0) {
    fetchUrl = '/proxy?url=' + encodeURIComponent(url);
  }
  fetch(fetchUrl)
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    })
    .then(function(blob) {
      var blobUrl = URL.createObjectURL(blob);
      doDownload(blobUrl);
    })
    .catch(function() {
      // fetch 失败（CORS 或网络错误），无法强制下载远程图片
      showToast('⚠️ 图片 ' + (idx + 1) + ' 下载失败，请点击"大图"按钮查看后右键另存为');
    });
}

function copyImageUrl(index) {
  var img = generatedImages[index];
  if (!img) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(img.dataUrl.substring(0, 100) + '...').then(function() {
      showToast('图片链接已复制（data URL）');
    });
  } else {
    showToast('图片 #' + (index + 1) + ' 已就绪');
  }
}

function viewFullImage(index) {
  var img = generatedImages[index];
  if (!img) return;
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  overlay.innerHTML = '<img src="' + img.dataUrl + '" style="max-width:90vw;max-height:90vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);" /><span style="position:absolute;top:20px;right:30px;color:#fff;font-size:28px;cursor:pointer;">✕</span>';
  // 三条关闭路径共用一个函数：点遮罩、点右上角 ✕、按 ESC。
  // 必须能重复调用而不报错 —— 点一下遮罩再按 ESC 是很自然的操作。
  var close = function() {
    if (overlay.parentNode) document.body.removeChild(overlay);
    popEscLayer(overlay);
  };
  overlay.onclick = close;
  pushEscLayer(overlay, close);
  document.body.appendChild(overlay);
}

// ============ 评论衍生 ============
// ============ 国内平台热门评论（9 个主流平台，10 条真实风格样本）============
// 这 10 条不是随便编的，是按"平台各自的评论语感"配的：
// 抖音短且带梗、小红书姐妹感、B站认真夸剪辑、知乎给论据、公众号克制专业、
// 微博抢转发、头条讲收藏。用户拿它当模板改，语感对不对比文字漂亮更重要。
//
// platformColor 刻意都避开纯黑：卡片背景是深色，标签用的是
// `background: color+'20'; color: color`，黑色进去就是一块看不见的标签。
var hotComments = [
  { id: 'hc1', platform: '抖音', platformColor: '#FE2C55', text: '这条我反复看了三遍，前3秒钩子那段直接给我干沉默了 👏 已经收藏，等下拿给我们运营看', likes: '48.2万', tag: '干货' },
  { id: 'hc2', platform: '小红书', platformColor: '#FF2442', text: '啊啊啊我找这个方法找了两个礼拜！！！看完立刻去试了一次就成了，姐妹你真的救我狗命 🥹 已关注+收藏', likes: '32.1万', tag: '感谢' },
  { id: 'hc3', platform: '视频号', platformColor: '#07C160', text: '关注半年了，每一条都是实打实的东西，没有废话没有硬广。这在现在真挺少见的，转发给我们群里几个同行了。', likes: '9.8万', tag: '支持' },
  { id: 'hc4', platform: '知乎', platformColor: '#0084FF', text: '这个回答如果两年前能看到，我能少踩三个坑。已收藏已赞同，如果作者出个更详细的版本我愿意付费。', likes: '4.3万', tag: '观点' },
  { id: 'hc5', platform: '微博', platformColor: '#E6162D', text: '今天刷到的唯一一条有营养的内容，先转再看，免得一会儿被淹了。求多更 🙏', likes: '11.5万', tag: '支持' },
  { id: 'hc6', platform: '微信公众号', platformColor: '#576B95', text: '在这行做了八年，看完还是学到了东西。文中讲注意力复利那段特别少有人提，感谢作者写出来。', likes: '2.1万', tag: '专业' },
  { id: 'hc7', platform: '抖音', platformColor: '#FE2C55', text: '没人问：凌晨两点的我，正在连刷一个小时前根本不感兴趣的选题第四集。你赢了 🔥', likes: '87.4万', tag: '破圈' },
  { id: 'hc8', platform: 'B站', platformColor: '#FB7299', text: '这剪辑是真的顶，全程没有一秒废话，节奏卡得死死的。up 这个水准建议全站学习。', likes: '18.6万', tag: '制作' },
  { id: 'hc9', platform: '小红书', platformColor: '#FF2442', text: '博主拆解得太清楚了，一步一步跟着做就行。自己瞎摸索了三个月，看这一篇就通了 🙌 无脑跟', likes: '24.3万', tag: '感谢' },
  { id: 'hc10', platform: '今日头条', platformColor: '#F04142', text: '已经收藏到三个夹子里了：一个存资料，一个存灵感，一个存"我自己也要做的内容"。真干货 💫', likes: '5.9万', tag: '收藏' }
];
var derivedComments = [];  // 保存最近的衍生结果
var currentDeriveCount = 3;

function renderHotComments() {
  var grid = document.getElementById('hotCommentGrid');
  if (!grid) return;
  var html = '';
  for (var i = 0; i < hotComments.length; i++) {
    var hc = hotComments[i];
    html += '<div class="hot-comment-card" onclick="loadCommentToInput(' + i + ')" title="点击加载到输入框">'
      + '<span class="hc-hint">📋 点击加载</span>'
      + '<span class="hc-platform" style="background:' + hc.platformColor + '20;color:' + hc.platformColor + ';">' + hc.platform + '</span>'
      + '<span style="font-size:10px;color:var(--text-secondary);margin-left:6px;background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;">' + hc.tag + '</span>'
      + '<div class="hc-text" style="margin-top:6px;">' + escapeHtml(hc.text) + '</div>'
      + '<div class="hc-meta">👍 ' + hc.likes + ' 热度</div>'
      + '</div>';
  }
  grid.innerHTML = html;
}

function refreshHotComments() {
  // 随机打乱并重新排序
  for (var i = hotComments.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = hotComments[i];
    hotComments[i] = hotComments[j];
    hotComments[j] = tmp;
  }
  renderHotComments();
  showToast('✅ 热门评论已刷新，点击任意评论即可加载到输入框');
}

function loadCommentToInput(idx) {
  var hc = hotComments[idx];
  if (!hc) return;
  var input = document.getElementById('commentInput');
  if (!input) return;
  input.value = hc.text;
  updateCommentCharCount();
  input.focus();
  showToast('📋 已加载「' + hc.platform + '」热门评论到输入框');
}

function clearCommentInput() {
  var input = document.getElementById('commentInput');
  if (input) { input.value = ''; updateCommentCharCount(); }
  document.getElementById('derivedResultGrid').innerHTML = '';
}

function updateCommentCharCount() {
  var input = document.getElementById('commentInput');
  var count = document.getElementById('commentCharCount');
  if (input && count) {
    var len = input.value.length;
    count.textContent = len + ' / 500 字';
    count.style.color = len > 500 ? 'var(--red)' : 'var(--text-secondary)';
  }
}

function updateDeriveNum() {
  var sel = document.getElementById('deriveNum');
  if (sel) currentDeriveCount = parseInt(sel.value) || 3;
}

async function startCommentDerivation() {
  var input = document.getElementById('commentInput');
  var loading = document.getElementById('commentLoading');
  var btn = document.getElementById('btnDeriveComment');
  var grid = document.getElementById('derivedResultGrid');
  var original = input.value.trim();
  if (!original) { showToast('⚠️ 请先输入或点选一条热门评论'); return; }
  if (original.length > 500) { showToast('⚠️ 评论最多 500 字'); return; }
  var num = currentDeriveCount;
  grid.innerHTML = '';
  loading.style.display = 'block';
  btn.disabled = true;
  var commentModelName = modelNameById(getPickedModelId('comment')) || '大模型';
  btn.innerHTML = '<div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> ' + commentModelName + '生成中...';

  try {
    // 平台调性直接写进 systemPrompt。不写清楚的话，模型只会产出
    // "太棒了！学到了！"这种谁都能发、跑不动量的废话评论 ——
    // 国内各平台的评论语感差别很大，抖音要短要有梗、小红书要姐妹感、
    // 知乎要给论据、公众号要克制，这些必须点名。
    var systemPrompt = '你是国内自媒体平台的资深社区运营。用户会给你一条热门评论，你要衍生出 ' + num + ' 条能在同一条内容下继续跑量的评论变体，适配抖音 / 小红书 / 快手 / 视频号 / 微信公众号 / B站 / 知乎 / 微博。\n\n'
      + '硬性要求：\n'
      + '1. 全部输出简体中文，不要出现英文句子。\n'
      + '2. 每条都要像真人在那个平台里随手打的，不是官方口吻：可以用口语、语气词、网络用语，emoji 最多 1-2 个，不要堆一排。\n'
      + '3. 保持和原评论一致的核心情绪与意图，但换角度、换切入点、换细节，不能读起来像同一句话的改写。\n'
      + '4. 长度 15-60 字，短而有信息量优于长。\n'
      + '5. 自然带一点互动引导（认同、追问、收藏、转发都可以），但绝对不要像广告。\n'
      + '6. 不要出现"作为AI""以下是"这类痕迹。\n\n'
      + '严格只返回 JSON 数组，不要 markdown 代码块，不要任何说明文字：\n'
      + '[{"text":"变体1"},{"text":"变体2"}]';
    var userPrompt = '原始热门评论：\n' + original + '\n\n衍生 ' + num + ' 条中文评论变体。';
    var result = await callModuleText('comment', systemPrompt, userPrompt);
    var derived = [];
    try {
      var clean = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      var parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        for (var i = 0; i < parsed.length; i++) {
          derived.push({ text: parsed[i].text || parsed[i].content || String(parsed[i]), index: i + 1 });
        }
      }
    } catch(e) {
      // JSON解析失败，按行拆分
      var lines = result.split('\n').filter(function(l) { return l.trim().length > 5; });
      for (var j = 0; j < Math.min(lines.length, num); j++) {
        // ⚠️ 这里原来写的是 `var t = ...`，而 t() 是全局 i18n 函数 ——
        // var 提升会让整个函数作用域内的 t 都变成字符串，于是函数末尾
        // 恢复按钮文字的 t('comment.btn.generate') 抛 TypeError，
        // 按钮永远停在"生成中..."（用户报的 Bug）。改名为 line。
        var line = lines[j].replace(/^[\d\."'\s、]+/, '').trim();
        derived.push({ text: line, index: j + 1 });
      }
    }
    if (derived.length === 0) {
      derived = buildLocalCommentDerivation(original, num);
    } else {
      derived = derived.slice(0, num);
    }
    derivedComments = derived;
    renderDerivedComments();
    var successModelName = modelNameById(getPickedModelId('comment')) || '大模型';
    showToast('✅ ' + successModelName + ' 已衍生 ' + derived.length + ' 条中文评论');
  } catch(e) {
    console.error('Comment derivation error:', e);
    derivedComments = buildLocalCommentDerivation(original, num);
    renderDerivedComments();
    showToast('⚠️ 模型没响应，已改用本地中文模板兜底');
  } finally {
    // 必须放 finally：放在 try/catch 之后的话，只要渲染/toast 里抛任何异常，
    // 按钮就会永远卡在"生成中..."。t() 也用 try 包一层兜底，
    // 万一 i18n 未就绪也要保证按钮能恢复可点。
    loading.style.display = 'none';
    btn.disabled = false;
    var genLabel = '衍生评论';
    try { genLabel = t('comment.btn.generate', '衍生评论'); } catch (e2) {}
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><polyline points="8,9 16,9"/><polyline points="8,13 14,13"/></svg> ' + genLabel;
  }
  // 滚到结果网格，而不是本页页首（用户已经在本页上）
  var sec = document.getElementById('derivedResultGrid') || document.getElementById('section-comment');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function buildLocalCommentDerivation(original, num) {
  // 本地兜底：模型不可用时直接给中文变体（不依赖原评论文字拼接，
  // 拼接出来的句子在中文里几乎一定不通顺，反而更像机器人）。
  // 8 种角度覆盖评论区最常见的几类跟评，按需要的条数循环取。
  var templates = [
    { style: '共鸣', fn: function() { return '这就是我一直想说但说不明白的事，每句都戳到了 👏 先收藏起来慢慢看'; } },
    { style: '推荐', fn: function() { return '这条值得更多人刷到。现在这种实在的内容太少了，已经转到我们群里 ✨'; } },
    { style: '提问', fn: function() { return '真心问一下，中间那段能不能再往深讲一层？感觉那里能单独出一期 👀'; } },
    { style: '见证', fn: function() { return '我三周前就是照这个思路做的，效果好得有点意外。本来不想评论，但这条值得留个证 🙌'; } },
    { style: '感谢', fn: function() { return '潜水很久第一次冒泡。这条内容真的帮到我了，谢谢你愿意把话讲这么清楚 🙏'; } },
    { style: '反转', fn: function() { return '说实话一开始我是不信的，看完没法装作没看见。服了 🔥'; } },
    { style: '求助', fn: function() { return '卡在第三步了，照着做还是过不去。评论区有人搞定了吗，求指个方向 💭'; } },
    { style: '背书', fn: function() { return '关注挺久了，这是我见过讲得最诚实、最不注水的一版。新来的朋友，你没走错地方 🌟'; } }
  ];
  var results = [];
  for (var i = 0; i < num; i++) {
    var tmpl = templates[i % templates.length];
    results.push({ text: tmpl.fn(), index: i + 1, style: tmpl.style });
  }
  return results;
}

function renderDerivedComments() {
  var grid = document.getElementById('derivedResultGrid');
  if (!grid) return;
  var html = '';
  for (var i = 0; i < derivedComments.length; i++) {
    var dc = derivedComments[i];
    html += '<div class="derived-comment-card">'
      + '<div class="dc-index">' + (dc.index || i + 1) + '</div>'
      + (dc.style ? '<span style="font-size:10px;background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;color:var(--text-secondary);margin-left:6px;">' + dc.style + '</span>' : '')
      + '<div class="dc-text">' + escapeHtml(dc.text) + '</div>'
      + '<div class="dc-actions">'
      + '<button onclick="copyDerivedComment(' + i + ')">📋 复制</button>'
      + '</div>'
      + '</div>';
  }
  grid.innerHTML = html;
}

function copyDerivedComment(idx) {
  var dc = derivedComments[idx];
  if (!dc) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(dc.text).then(function() { showToast('✅ 已复制第 ' + (idx+1) + ' 条衍生评论'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = dc.text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✅ 已复制第 ' + (idx+1) + ' 条衍生评论');
  }
}

// 页面加载时渲染热门评论 + 棘手评论示例
document.addEventListener('DOMContentLoaded', function() {
  renderHotComments();
  renderTrickyComments();
});

// ============ 棘手评论回复 ============
var currentPlatform = 'douyin';  // 默认调性：抖音（国内流量最大）
var smartReplies = [];  // 当前的回复结果
var currentIntent = null;  // 当前意图分类
var currentReplyCount = 3;  // 默认生成3条回复

function selectReplyPlatform(platform) {
  currentPlatform = platform;
  var btns = document.querySelectorAll('.platform-select-row .platform-btn');
  for (var i = 0; i < btns.length; i++) { btns[i].classList.remove('active'); }
  // 这里的 id 必须和 section-smart-reply 里四个按钮的 id 严格对上，
  // 两边任何一侧单独改名都会让"选中态"直接失效（点了没反应）。
  var idMap = { douyin: 'platform-dy', xiaohongshu: 'platform-xhs', shipinhao: 'platform-sph', gongzhonghao: 'platform-gzh' };
  var target = document.getElementById(idMap[platform] || 'platform-dy');
  if (target) target.classList.add('active');
}

function updateReplyCount() {
  var sel = document.getElementById('replyCount');
  if (sel) currentReplyCount = parseInt(sel.value) || 3;
}

function updateSmartReplyCharCount() {
  var input = document.getElementById('smartReplyInput');
  var count = document.getElementById('smartReplyCharCount');
  if (input && count) {
    var len = input.value.length;
    count.textContent = len + ' / 500 字';
    count.style.color = len > 500 ? 'var(--red)' : 'var(--text-secondary)';
  }
}

function clearSmartReplyInput() {
  var input = document.getElementById('smartReplyInput');
  if (input) { input.value = ''; updateSmartReplyCharCount(); }
  document.getElementById('intentResultArea').style.display = 'none';
  document.getElementById('replyCardsGrid').innerHTML = '';
  smartReplies = [];
  currentIntent = null;
}

async function classifyAndReply() {
  var input = document.getElementById('smartReplyInput');
  var loading = document.getElementById('smartReplyLoading');
  var btn = document.getElementById('btnSmartReply');
  var original = input.value.trim();
  if (!original) { showToast('⚠️ 请先输入需要回复的评论'); return; }
  if (original.length > 500) { showToast('⚠️ 评论最多 500 字'); return; }

  // 清空旧结果
  document.getElementById('replyCardsGrid').innerHTML = '';
  document.getElementById('intentResultArea').style.display = 'none';
  smartReplies = [];
  currentIntent = null;

  loading.style.display = 'block';
  btn.disabled = true;
  var replyModelName = modelNameById(getPickedModelId('reply')) || '大模型';
  btn.innerHTML = '<div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> ' + replyModelName + ' 分析中...';

  var platformNames = { douyin: '抖音', xiaohongshu: '小红书', shipinhao: '视频号', gongzhonghao: '微信公众号' };
  var platformName = platformNames[currentPlatform] || '抖音';
  var platformStyle;
  if (currentPlatform === 'xiaohongshu') {
    platformStyle = '姐妹感、亲和、有温度，可以用"～"和语气词，emoji 最多 1-2 个，像真人博主回私信，不能像品牌客服';
  } else if (currentPlatform === 'shipinhao') {
    platformStyle = '偏稳重但不生硬，第一人称，可以稍长一点，适合私域沉淀，基本不用 emoji';
  } else if (currentPlatform === 'gongzhonghao') {
    platformStyle = '克制、专业、有信息量，不用 emoji，不说空话，能给出一个具体判断或依据';
  } else {
    // 抖音默认
    platformStyle = '短、口语、有网络感，一句话说完，emoji 最多 1 个，绝不官腔';
  }

  try {
    // intent 让模型按中文词返回（"咨询/夸赞/吐槽/广告/其他"）：
    // 国内模型对中文枚举的稳定性明显好于英文枚举，
    // 到 parseSmartReplyResult 里再统一映射回英文 key。
    var systemPrompt = '你是' + platformName + '上处理棘手评论的顶级社区运营。你的任务：\n\n'
      + '1. 先判断这条评论的意图，必须严格是以下 5 个中文词之一："咨询"、"夸赞"、"吐槽"、"广告"、"其他"\n'
      + '2. 再生成 ' + currentReplyCount + ' 条回复草稿，每条不超过 120 字，语气符合' + platformName + '（' + platformStyle + '）\n'
      + '3. 回复策略：\n'
      + '   - 咨询：给一个具体方向，可以自然引导到私信 / 主页置顶 / 合集，不要硬推\n'
      + '   - 夸赞：真诚感谢 + 抛一个追问，把评论区的对话续下去\n'
      + '   - 吐槽：先共情，绝不争辩，平和地把话题拉回来；承认对方的情绪，但不认下不实的指责\n'
      + '   - 广告：客气但明确地拒绝，不要接对方的话术、不要给链接，可以把话题转回内容本身\n'
      + '   - 其他：友好、简短，留个开口\n\n'
      + '硬性要求：\n'
      + '- 全部用简体中文回复，不要出现英文句子。\n'
      + '- 要像真的' + platformName + '博主在回评论，不是企业客服机器人。\n'
      + '- 不要出现"作为AI""以下是"这类痕迹。\n\n'
      + '严格只返回下面这个 JSON，不要 markdown 代码块，不要任何说明文字：\n'
      + '{"intent":"咨询","replies":["回复1","回复2","回复3"]}';

    var userPrompt = '平台：' + platformName + '\n评论：\n' + original + '\n\n判断意图并写 ' + currentReplyCount + ' 条中文回复。';

    var result = await callModuleText('reply', systemPrompt, userPrompt);
    var parsed = parseSmartReplyResult(result);
    if (!parsed) throw new Error('Parse failed');

    currentIntent = parsed.intent;
    smartReplies = parsed.replies.map(function(r, i) {
      return { text: r, index: i + 1 };
    });
    renderSmartReplyResult();
    showToast('✅ 意图识别：' + getIntentDisplayLabel(currentIntent) + ' —— 已生成 ' + smartReplies.length + ' 条回复');
  } catch(e) {
    console.log('Smart reply API failed, using local engine:', e.message);
    // 本地兜底
    var local = buildLocalSmartReplies(original);
    currentIntent = local.intent;
    smartReplies = local.replies.map(function(r, i) { return { text: r, index: i + 1 }; });
    renderSmartReplyResult();
    showToast('⚠️ 模型不可用，已改用本地中文模板兜底');
  }

  loading.style.display = 'none';
  btn.disabled = false;
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12c0 1.6.4 3.1 1.1 4.4L2 22l5.6-1.1c1.3.7 2.8 1.1 4.4 1.1z"/></svg> ' + t('reply.btn.generate', '生成回复');
  // 同上：滚到回复卡片区而不是本页页首
  var _rg = document.getElementById('replyCardsGrid') || document.getElementById('section-smart-reply');
  if (_rg) _rg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function parseSmartReplyResult(rawText) {
  var jsonStr = rawText.trim();
  // 清理 markdown 包裹
  if (jsonStr.indexOf('```') !== -1) {
    var match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();
  }
  // 找到 JSON 对象
  var objStart = jsonStr.indexOf('{');
  var objEnd = jsonStr.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    jsonStr = jsonStr.substring(objStart, objEnd + 1);
  }
  var obj = JSON.parse(jsonStr);
  var validIntents = ['inquiry', 'praise', 'complaint', 'spam', 'other'];
  var intent = String(obj.intent || 'other').toLowerCase();
  // systemPrompt 要求模型返回中文意图词，这里统一映射回英文 key ——
  // getIntentCnClass / getIntentDisplayLabel / 本地模板三处都以英文 key 索引，
  // CSS 类名也是 zixun/kuazan/tucao/ad 这一套，换 key 反而要连带改 CSS。
  // 顺手多认几个模型爱自己发明的近义词，少落到 other。
  var cnToKey = {
    '咨询': 'inquiry', '提问': 'inquiry', '询问': 'inquiry',
    '夸赞': 'praise', '表扬': 'praise', '好评': 'praise',
    '吐槽': 'complaint', '投诉': 'complaint', '差评': 'complaint',
    '广告': 'spam', '广告推广': 'spam', '推广': 'spam', '引流': 'spam',
    '其他': 'other'
  };
  if (cnToKey[obj.intent]) intent = cnToKey[obj.intent];
  if (validIntents.indexOf(intent) === -1) intent = 'other';
  var replies = [];
  if (Array.isArray(obj.replies)) {
    for (var i = 0; i < obj.replies.length; i++) {
      if (typeof obj.replies[i] === 'string') replies.push(obj.replies[i]);
    }
  }
  if (replies.length === 0) return null;
  // 截断到 200 字。systemPrompt 要的是 120 字以内，200 只是给模型留的溢出余量，
  // 不是目标长度 —— 中文回复本来就比英文短，240 那个数是海外版留下的。
  return {
    intent: intent,
    replies: replies.slice(0, currentReplyCount).map(function(r) { return r.length > 200 ? r.substring(0, 200) : r; })
  };
}

function getIntentCnClass(intent) {
  var m = { inquiry: 'zixun', praise: 'kuazan', complaint: 'tucao', spam: 'ad', other: 'other' };
  return m[intent] || 'other';
}
function getIntentDisplayLabel(intent) {
  var m = { inquiry: '❓ 咨询', praise: '💛 夸赞', complaint: '😤 吐槽', spam: '📢 广告推广', other: '💬 其他' };
  return m[intent] || '💬 其他';
}

function renderSmartReplyResult() {
  // 意图展示
  var intentArea = document.getElementById('intentResultArea');
  if (intentArea && currentIntent) {
    intentArea.style.display = 'flex';
    intentArea.className = 'intent-result';
    intentArea.innerHTML = '<span class="intent-label">识别到的意图</span>'
      + '<span class="intent-badge ' + getIntentCnClass(currentIntent) + '">' + getIntentDisplayLabel(currentIntent) + '</span>';
  }

  // 回复卡片
  var grid = document.getElementById('replyCardsGrid');
  if (!grid) return;
  var platformLabels = { douyin: '🎵 抖音', xiaohongshu: '📕 小红书', shipinhao: '🎬 视频号', gongzhonghao: '📰 微信公众号' };
  var platformLabel = platformLabels[currentPlatform] || '🎵 抖音';
  var html = '';
  for (var i = 0; i < smartReplies.length; i++) {
    var sr = smartReplies[i];
    html += '<div class="reply-card">'
      + '<div class="rc-index">' + (sr.index || i + 1) + '</div>'
      + '<div class="rc-meta">' + platformLabel + ' · ' + (sr.text.length) + ' 字</div>'
      + '<div class="rc-text">' + escapeHtml(sr.text) + '</div>'
      + '<div class="rc-actions">'
      + '<button id="rc-copy-' + i + '" onclick="copySmartReply(' + i + ')">📋 复制</button>'
      + '</div>'
      + '</div>';
  }
  grid.innerHTML = html;
}

function copySmartReply(idx) {
  var sr = smartReplies[idx];
  if (!sr) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(sr.text).then(function() { showToast('✅ 已复制第 ' + (idx+1) + ' 条回复'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = sr.text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✅ 已复制第 ' + (idx+1) + ' 条回复');
  }
}

// 本地兜底引擎：关键词意图分类 + 中文模板回复（模型不可用时用）
function buildLocalSmartReplies(comment) {
  var intent = 'other';

  // ⚠️ 判断顺序是有讲究的，别按"咨询→夸赞→吐槽→广告"这种直觉顺序排。
  // 原来就是那个顺序，结果广告评论几乎必然被误判成咨询 ——
  // 引流话术里一定带钩子问句（"想约个15分钟电话看看有没有合作机会"
  // 里的"有没有"就命中咨询），然后系统会拿咨询模板去认真回复一条广告。
  // 改成 广告→吐槽→夸赞→咨询：广告的特征词（私我/代运营/名额有限/月入）
  // 最独特、最不会误伤，最该先命中；咨询的词最泛，放最后兜。
  if (/加微信|私我|私聊|加我|代理|加盟|代运营|课程|免费领|免费诊断|扫码|加群|名额有限|月入|涨粉|带你做|合作机会|互推/.test(comment)
      || /(🔥){2,}/.test(comment)) {
    intent = 'spam';
  } else if (/差评|太差|很烂|垃圾|骗|坑|投诉|退款|假的|烦|取关|失望|标题党|浪费|全是水|没干货|洗稿|抄的|无聊/.test(comment)) {
    intent = 'complaint';
  } else if (/厉害|牛|点赞|赞同|太棒|优秀|专业|干货|学到了|受益|良心|真诚|绝了|爱了|治愈|讲得清楚|说得对|感谢|谢谢/.test(comment)) {
    intent = 'praise';
  } else if (/怎么|如何|请问|求问|求教|推荐|哪个|哪家|靠不靠谱|能不能|可以吗|行不行|有没有|多少钱|在哪|新手|小白|帮我看看/.test(comment)) {
    intent = 'inquiry';
  }

  // 四套模板对应四种平台调性，不是同一批话换个 emoji ——
  // 抖音要短到能一眼看完，公众号要能给出判断依据，两者互换会立刻显得假。
  var platformTemplates = {
    douyin: {
      inquiry: [
        '这个问题问得好～说实话得看你现在的底子，我置顶那条讲得比较细，先去看一眼，卡住了再回来问我 👀',
        '新手就一句话：先把最基础的那步做扎实。主页有个新手合集，从头刷一遍就够用了 🎯',
        '真实回答：选你能坚持30天的那个就行，别选看起来最厉害的。就这么简单 💯'
      ],
      praise: [
        '这条评论我截图了，今天最治愈的一句 🥹 下一期你最想看啥，我记下来',
        '别别别 会哭的 😭 谢谢你，这句话能顶我再拍十条',
        '看到这个直接原地开心 ✨ 你觉得哪一段最有用？我按这个方向多做点'
      ],
      complaint: [
        '说得挺实在的，是哪一段没讲到位？你告诉我，下一条我改 🫡',
        '收到了，不是每条都能拍好，这是真的。你觉得怎么弄会更有用？',
        '这个批评我接，宁愿你直接说，也别默默划走 🙏'
      ],
      spam: [
        '谢谢来看，但合作和推广一律不接，祝你顺利 🙅',
        '这个得婉拒了，号里不放任何引流和带货。祝好 💫',
        '这类先不聊了，不过还是谢谢你来 🫡'
      ],
      other: [
        '这条评论有点跳跃但我居然懂 😂 你具体指哪块？',
        '收到了 💬 你这句背后是啥意思，讲讲',
        '看见你了 👀 有后半句的话接着说'
      ]
    },
    xiaohongshu: {
      inquiry: [
        '好问题！其实主要看你想要什么效果～我把步骤拆在主页置顶笔记里了，先看看，还卡住就私信我 💌',
        '能想到问这个已经很棒了！简单说就是先从最基础的开始，我有一篇新手向的笔记，搜一下就能看到 ✨',
        '完全懂你那种选不出来的感觉～小建议：选和你现在情况最匹配的那个，不用一上来就冲最难的 🌱'
      ],
      praise: [
        '这条评论直接治愈我一整天 🥹 谢谢你！还想看什么主题？评论告诉我，我记进选题表',
        '看到这条我在笑～谢谢你专门打这么多字。你打算先试哪一个呀 💫',
        '真的很暖 💛 好奇问一下你做这个多久了？也想听听你的经验'
      ],
      complaint: [
        '看到啦～这个反馈很有用，我宁愿知道也不想被默默取关。具体是哪部分你觉得不对？我可以重做 🫶',
        '谢谢你愿意说出来。不是每篇都能戳到所有人，这很正常。方便的话说说你更想看什么 🌿',
        '这话我接得住，也尊重你的看法。想问一下是选题、节奏还是观点的问题？下一篇我调'
      ],
      spam: [
        '谢谢光临～不过暂时不做任何合作和互推，祝你一切顺利 🌱',
        '收到你的消息了，但这个账号不接广。如果你是来看内容的，随时欢迎提问 💛',
        '这个我就先不接了，不过真心祝你做的事情顺利 ✨'
      ],
      other: [
        '你这个思路挺有意思的～再说说？评论区聊也行 💬',
        '谢谢你来留言！有什么具体想问的吗，还是随便逛逛 🌸',
        '看到啦 🫶 如果里面藏了问题，直接问就好'
      ]
    },
    shipinhao: {
      inquiry: [
        '这个问题很实在。老实说要看你目前的基础，多数情况我建议先从最简单那步做起。需要的话可以私信细聊。',
        '谢谢提问。实际操作里主要看两个变量：能投入的时间和已有的资源。哪一项紧，就先选门槛低的那个。',
        '我的判断顺序是：先看现状，再找最大的卡点，然后选能解掉这个卡点的方案。顺序比选项更重要。'
      ],
      praise: [
        '谢谢你这段话，真的很受用。想问一下，这里面哪一部分和你现在做的事情最相关？',
        '感谢你看完还专门留言。如果觉得有用，也很想听听你会怎么结合自己的情况去调整。',
        '这句话对我很重要。我做这些其实也是在梳理自己的思路，你会想反驳哪一点？'
      ],
      complaint: [
        '谢谢你直说。具体是哪一点你不同意？我是真想听，观点被挑战才有进步。',
        '这个反驳很合理。如果你有更有说服力的例子，欢迎发在评论区，对其他人也有帮助。',
        '明白。我也不认为这套东西适用于所有情况，很想知道你的具体场景，这样才能回应到点上。'
      ],
      spam: [
        '谢谢联系。目前不接商务合作，祝你事业顺利。',
        '收到你的消息。这个号只用来做内容，不做销售转化，婉拒别往心里去。',
        '暂时不方便约时间，但真心祝你做的事情顺利。'
      ],
      other: [
        '谢谢留言。如果有哪个角度你想让我展开讲讲，随时说。',
        '感谢你的互动。可以再多说两句，我每条都会看，只是不一定都公开回复。',
        '收到。如果有后续的问题，欢迎接着问。'
      ]
    },
    gongzhonghao: {
      inquiry: [
        '这个问题问得很到位。直接的答案是：取决于你目前所处的阶段。多数读者的情况下，先做简单的那一步收益最高。需要的话可以后台留言细聊。',
        '感谢提问。实践中这个选择通常由两个因素决定：可投入的时间和已有的积累。任一项受限，都建议先选门槛更低的方案。',
        '我常用的判断顺序是：先盘清现状，再找出最大的瓶颈，然后选择能解决这个瓶颈的方案。顺序本身比选哪个方案更关键。'
      ],
      praise: [
        '谢谢你的留言，这段话我认真读了。想请问一下，文中哪一部分和你目前的工作最直接相关？',
        '感谢你读完并留下反馈。如果觉得有用，也很想知道你会怎么结合自己的情况做调整。',
        '这句话对我很有意义。写作对我来说也是一次梳理，如果有你想反驳的地方，欢迎直接说。'
      ],
      complaint: [
        '感谢直接的反馈。具体是哪一个观点你不认同？我是真想听，被指出问题才有修正的机会。',
        '这个质疑站得住。如果你手上有更有力的反例，欢迎写在评论区，那比私下争论对其他读者更有价值。',
        '明白。我并不认为这套判断适用于所有情形，如果你愿意说说你的具体场景，我可以针对性地回应。'
      ],
      spam: [
        '感谢联系。目前不接商务合作与推广，祝你的事业顺利。',
        '收到你的消息。这个号只用于写作，不做销售转化，婉拒之处请不要介意。',
        '这次不太合适，但真心祝你正在做的事情顺利。'
      ],
      other: [
        '谢谢留言。如果有想让我展开的角度，欢迎具体说说。',
        '感谢你的参与。每条留言我都会看，即使不一定公开回复。',
        '收到。如果有后续问题，随时可以接着问。'
      ]
    }
  };

  var templates = platformTemplates[currentPlatform];
  if (!templates) templates = platformTemplates.douyin;
  var replies = templates[intent] || templates.other;
  return { intent: intent, replies: replies };
}

// ============ 内置棘手评论（5 类意图 × 2 条，覆盖 9 个国内平台）============
// 这 10 条同时是本地分类器的回归用例：按上面「广告→吐槽→夸赞→咨询」的顺序，
// 10 条全部能落到自己的 tag 上。以后改关键词表，先拿这 10 条过一遍。
var trickyComments = [
  // 咨询 (2)
  { platform: '小红书', platformColor: '#FF2442', text: '请问一下，我自己开了个小店，粉丝还不到1000，这个方法对我这种情况也有用吗？还是只适合本来就有流量的博主啊，有点怕投进去没效果 🥲', tag: '咨询' },
  { platform: 'B站', platformColor: '#FB7299', text: '小白一个，up 说的这几个到底哪个更推荐新手先上手？视频里讲的选项太多了，我完全不知道从哪开始 😫', tag: '咨询' },
  // 夸赞 (2)
  { platform: '抖音', platformColor: '#FE2C55', text: '关注两年了，这是第一次评论。真的是我首页里最稳定输出干货的号。后面会出进阶版吗 🙏', tag: '夸赞' },
  { platform: '知乎', platformColor: '#0084FF', text: '这篇比我上个月买的那个付费课讲得清楚多了，先赞同了。不过第三步能不能再展开讲讲？感觉还差两段。', tag: '夸赞' },
  // 吐槽 (2)
  { platform: '微博', platformColor: '#E6162D', text: '浪费我八分钟。标题党，全是水，一半时间在让我点赞关注。现在的博主真是没一个能信的。', tag: '吐槽' },
  { platform: '微信公众号', platformColor: '#576B95', text: '说实话有点失望。以前挺认可你写的东西，最近几篇都是把别人号里的观点换个说法，像洗稿。取关了，希望你能找回自己的东西。', tag: '吐槽' },
  // 广告 (2)
  { platform: '小红书', platformColor: '#FF2442', text: '私我领【免费诊断】📞 我带过50+个博主一个月做到月入过万，名额有限，前5个额外送一套模板包 🔥🔥🔥', tag: '广告' },
  { platform: '视频号', platformColor: '#07C160', text: '写得很好！我这边是做增长代运营的，也搭了套差不多的框架，想约个15分钟电话看看有没有合作机会，已经加你了。', tag: '广告' },
  // 其他 (2)
  { platform: '快手', platformColor: '#FF6E00', text: '但是为什么你的声音听着跟那个纪录片旁白一模一样啊 😭😭 我现在没法不注意了', tag: '其他' },
  { platform: '今日头条', platformColor: '#F04142', text: '内容还行，不过感觉这个月在另外两个号也刷到过类似的。不知道是趋势还是撞车 🤔', tag: '其他' }
];

function renderTrickyComments() {
  var grid = document.getElementById('trickyCommentGrid');
  if (!grid) return;
  var html = '';
  for (var i = 0; i < trickyComments.length; i++) {
    var tc = trickyComments[i];
    html += '<div class="hot-comment-card" onclick="loadTrickyCommentToInput(' + i + ')" title="点击加载到输入框">'
      + '<span class="hc-hint">📋 点击加载</span>'
      + '<span class="hc-platform" style="background:' + tc.platformColor + '20;color:' + tc.platformColor + ';">' + tc.platform + '</span>'
      + '<span style="font-size:10px;color:var(--text-secondary);margin-left:6px;background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;">' + tc.tag + '</span>'
      + '<div class="hc-text" style="margin-top:6px;">' + escapeHtml(tc.text) + '</div>'
      + '</div>';
  }
  grid.innerHTML = html;
}

function loadTrickyCommentToInput(idx) {
  var tc = trickyComments[idx];
  if (!tc) return;
  var input = document.getElementById('smartReplyInput');
  if (!input) return;
  input.value = tc.text;
  updateSmartReplyCharCount();
  input.focus();
  showToast('📋 已加载「' + tc.platform + '」棘手评论到输入框');
}

// ============ 自媒体资产 ============
var generatedScripts = [];
var generatedVideos  = [];
var currentAssetCategory = 'all';
var currentAssetSearch  = '';

// ============ 数据持久化（后端 SQLite，按用户隔离） ============
// 媒体永久化的关键：厂商返回的图片/视频链接是**临时**的（Agnes 自己标注 24 小时过期），
// 只把 URL 存进快照等于没存 —— 明天再看就是一堆破图。
// 所以先把远端字节交给服务器落盘，换成本地 /api/data/media|image/<id> 再快照。

// 判断一个地址是否已经是本地落盘资源（幂等保护，避免重复上传）
function isLocalMediaUrl(u) {
  return typeof u === 'string' && u.indexOf('/api/data/') === 0;
}

// 把远端媒体交给服务器抓回本地磁盘。成功返回 {id, url}，失败返回 null（不抛异常，
// 调用方继续用远端 URL 兜着，至少当天还能看）。
async function persistMediaUrl(remoteUrl, kind, meta) {
  if (!window.currentUser) return null;
  if (!remoteUrl || isLocalMediaUrl(remoteUrl)) return null;
  if (typeof remoteUrl !== 'string' || remoteUrl.indexOf('http') !== 0) return null;
  try {
    var resp = await fetch('/api/data/media', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: remoteUrl,
        kind: kind === 'image' ? 'image' : 'video',
        title: (meta && meta.title) || '',
        platform: (meta && meta.platform) || '',
        model: (meta && meta.model) || ''
      })
    });
    var d = await resp.json();
    if (d && d.success && d.url) return { id: d.id, url: d.url, bytes: d.bytes };
    console.warn('[persistMediaUrl] 落盘失败:', d && d.error);
  } catch (e) {
    console.warn('[persistMediaUrl] 请求异常:', e && e.message);
  }
  return null;
}

// 生成即入库。
// ⚠️ 之前 11 个 push 资产的地方只有 1 处调了 saveAppData()，其余全靠 30 秒定时器 ——
// 生成完立刻刷新/关页面就丢了，这就是用户说"文章/视频没保存到资产"的原因。
// 这里做 800ms 防抖，连续生成时不会打爆后端。
var _flushAssetsTimer = null;
function flushAssets() {
  try { updateAssetBadge(); } catch (e) {}
  if (_flushAssetsTimer) clearTimeout(_flushAssetsTimer);
  _flushAssetsTimer = setTimeout(function() {
    _flushAssetsTimer = null;
    saveAppData();
  }, 800);
}

var _saveAppDataPending = false;

// ==================== 工作区持久化 ====================
// 解决三件用户反馈：
//   ④ 抓完商品后隔一会儿点「生成文章」提示"请先抓取商品" —— 因为 currentProductContext
//      是个纯内存变量，刷新页面就没了（不是缓存过期，本来就没有任何 TTL 机制）
//   ⑤ 刷新页面后输入框全空 —— 之前 appdata 快照只存 4 个资产数组，输入框状态从未被保存过
//   ⑥ 退出重登后工作区丢失 —— 同上；数据本身按 user_id 隔离存在服务器，所以重登能恢复
//
// 存进已有的 appdata blob（user_appdata 表已按用户隔离），后端零改动。

// 需要持久化的输入框。
// 刻意排除：
//   authUsername/regUsername/各密码框 —— 凭据绝不落盘
//   promptSearch/assetSearchInput —— 搜索框，恢复后列表默认被过滤，用户会以为数据丢了
//   promptEditContent/modelEdit* —— 弹窗编辑缓冲区，恢复会让下次开弹窗看到上次残留
//                                    （正是之前修过的那类 autofill bug）
var WORKSPACE_INPUT_IDS = [
  'articleTopic', 'productUrlInput', 'searchInput',
  'imagePromptInput', 'vcPromptInput', 'tsPromptInput',
  'commentInput', 'smartReplyInput', 'fqInput'
];

// 单次快照上限。currentArticle.content 是整篇文章 HTML，可能几十 KB；
// 不设上限的话 blob 会随使用无限膨胀，把每次保存都拖慢。
var WORKSPACE_MAX_BYTES = 512 * 1024;

function captureWorkspace() {
  var ws = { inputs: {}, savedAt: Date.now() };
  for (var i = 0; i < WORKSPACE_INPUT_IDS.length; i++) {
    var el = document.getElementById(WORKSPACE_INPUT_IDS[i]);
    if (el && el.value) ws.inputs[WORKSPACE_INPUT_IDS[i]] = el.value;
  }

  // 短视频脚本：真值在 #scriptContent 的 textContent（#scriptEditor 只是编辑态的临时框，
  // 平时根本不在 DOM 里 —— editScript() 才把它 innerHTML 出来）。存错了会恢复出一个空脚本。
  var sc = document.getElementById('scriptContent');
  if (sc && sc.textContent.trim()) ws.scriptContent = sc.textContent;

  // 分镜脚本：同理，真值在 #vcStoryboardView 的 textContent，
  // vcGenerateSegments() 读的也是它，不是 #vcStoryboardEdit
  var sbv = document.getElementById('vcStoryboardView');
  if (sbv && sbv.textContent.trim()) ws.storyboard = sbv.textContent;

  // ④ 的直接解药
  if (currentProductContext) {
    try { ws.productContext = JSON.parse(JSON.stringify(currentProductContext)); } catch (e) {}
    // 核对区可能被用户改过，存当前 DOM 的版本而不是抓取时的快照
    var dg = document.getElementById('productDigest');
    if (dg && ws.productContext) {
      ws.productContext._editedDigestHTML = dg.innerHTML;
      ws.productContext._reviewedText = htmlDigestToText(dg);
    }
  }

  if (currentArticle) {
    ws.currentArticle = {
      title: currentArticle.title || '',
      content: currentArticle.content || '',
      img1: currentArticle.img1 || '', img2: currentArticle.img2 || '', img3: currentArticle.img3 || ''
    };
  }

  // 选择态。只存没有别处安身的：模型选择由 module_defaults 独立持久化，
  // 在这里再存一份会和它抢，重现"设为默认刷新后被打回"那个 bug（见 getPickerRenderModelId 注释）。
  ws.selections = {
    selectedPlatform: selectedPlatform,
    selectedVideoPlatform: selectedVideoPlatform,
    currentSearchSource: currentSearchSource
  };

  // ---- 自由问答对话历史 ----
  // 刻意剥掉 images 里的 base64：一张压缩后的图仍有 100-300KB，而快照上限只有 512KB，
  // 存两张就把整个快照挤爆（那时连输入框状态都保不住）。只留张数，恢复时渲染成占位标记。
  // 同时裁到最近 FQ_MAX_TURNS*2 条 —— 聊得越久快照越大，不裁会慢慢逼近上限。
  if (typeof fqHistory !== 'undefined' && fqHistory.length) {
    var fqStart = Math.max(0, fqHistory.length - FQ_MAX_TURNS * 2);
    ws.fqHistory = fqHistory.slice(fqStart).map(function(m) {
      return {
        role: m.role,
        text: String(m.text || '').slice(0, 8000),      // 单条上限，防某次超长输出独占快照
        imgCount: (m.images && m.images.length) || 0,
        sources: (m.sources || []).slice(0, 5).map(function(s) {
          return { title: String(s.title || '').slice(0, 200), source: s.source || '', url: s.url || '' };
        }),
        modelName: m.modelName || '',
        searched: !!m.searched,
        isError: !!m.isError,
        ts: m.ts || 0
      };
    });
  }

  // 超限就丢掉最大的那块（文章正文），只留标题，让其余状态还能存下去
  try {
    if (JSON.stringify(ws).length > WORKSPACE_MAX_BYTES && ws.currentArticle) {
      console.warn('[captureWorkspace] 快照超过 ' + WORKSPACE_MAX_BYTES + ' 字节，丢弃文章正文只留标题');
      ws.currentArticle.content = '';
      ws.currentArticle.truncated = true;
    }
    // 文章正文丢了还超，就再丢对话历史（它是可再生的聊天记录，优先级低于商品上下文）
    if (JSON.stringify(ws).length > WORKSPACE_MAX_BYTES && ws.fqHistory) {
      console.warn('[captureWorkspace] 仍超限，丢弃自由问答历史');
      delete ws.fqHistory;
    }
  } catch (e) {}
  return ws;
}

function restoreWorkspace(ws) {
  if (!ws || typeof ws !== 'object') return;
  try {
    var inputs = ws.inputs || {};
    for (var id in inputs) {
      if (WORKSPACE_INPUT_IDS.indexOf(id) === -1) continue;   // 只回填白名单内的，容忍后端存了旧字段
      var el = document.getElementById(id);
      if (el) el.value = inputs[id];                          // 元素不存在就跳过，容忍未来改版
    }

    // ---- 商品上下文（④）----
    if (ws.productContext) {
      currentProductContext = ws.productContext;
      // ⚠️ 走 renderProductCard 这条既有路径，不新开 innerHTML 直写通道 ——
      // _rawDigestHTML 源自抓取的第三方页面，是不可信输入，renderProductCard
      // 内部会过 safeUrl/escapeAttr。
      try { renderProductCard(currentProductContext); } catch (e) { console.warn('[restoreWorkspace] renderProductCard 失败', e); }
      // 恢复用户改过的核对文本（renderProductCard 会重置成原始抓取版）
      if (ws.productContext._editedDigestHTML) {
        var dg = document.getElementById('productDigest');
        // 只在确实改过时覆盖，否则白跑一次并把状态标成"已修改"
        if (dg && ws.productContext._editedDigestHTML !== dg.innerHTML) {
          dg.innerHTML = ws.productContext._editedDigestHTML;
          try { onProductDigestEdit(); } catch (e) {}
        }
      }
      // UI 联动：不做这一步就会出现"商品卡在但清除按钮是灰的"这种更糟的半死状态
      var bc = document.getElementById('btnClearProduct');
      if (bc) bc.style.display = '';
      var pe = document.getElementById('productEmpty');
      if (pe) pe.style.display = 'none';
    }

    // ---- 文章 ----
    if (ws.currentArticle && (ws.currentArticle.title || ws.currentArticle.content)) {
      currentArticle = ws.currentArticle;
      try { updateVideoSourceOptions(); } catch (e) {}
    }

    // ---- 短视频脚本：内容在就把结果区显示出来，否则用户看不到自己上次的脚本 ----
    if (ws.scriptContent) {
      var sc = document.getElementById('scriptContent');
      if (sc) {
        sc.textContent = ws.scriptContent;
        var sr = document.getElementById('scriptResult');
        if (sr) sr.style.display = 'block';
      }
    }

    // ---- 分镜脚本：连同它所在的整块区域一起显示 ----
    if (ws.storyboard) {
      var sbv = document.getElementById('vcStoryboardView');
      if (sbv) {
        sbv.textContent = ws.storyboard;
        sbv.style.display = 'block';
        var sbe = document.getElementById('vcStoryboardEdit');
        if (sbe) sbe.value = ws.storyboard;
        var area = document.getElementById('vcStoryboardArea');
        if (area) area.style.display = 'block';
        // 按钮组要跟上，否则有脚本却没有「生成片段」入口
        var b1 = document.getElementById('btnVcGenStoryboard'); if (b1) b1.style.display = 'none';
        var b2 = document.getElementById('btnVcEditStoryboard'); if (b2) b2.style.display = '';
        var b3 = document.getElementById('btnVcGenSegments'); if (b3) b3.style.display = '';
      }
    }

    // ---- 选择态 + 对应的 chip 高亮 ----
    // 快照可能是海外版时期存的（selectedPlatform: 'instagram' 之类）。
    // 这些键在国内版已经不存在：chip 行匹配不到会保持默认高亮"小红书"，
    // 而 selectedPlatform 却真的变成了 instagram —— 用户看到的和实际生成用的
    // 是两个平台，人设 prompt 静默退化成通用兜底。所以恢复前先按白名单校验。
    var sel = ws.selections || {};
    var _ARTICLE_PLATFORM_KEYS = ['xiaohongshu', 'wechat', 'toutiao', 'zhihu', 'weibo'];
    var _VIDEO_PLATFORM_KEYS = ['douyin', 'kuaishou', 'shipinhao', 'xiaohongshu', 'bilibili'];
    if (sel.selectedPlatform && _ARTICLE_PLATFORM_KEYS.indexOf(sel.selectedPlatform) > -1) {
      selectedPlatform = sel.selectedPlatform;
      _restoreChipActive('#section-article .platform-chip', "selectPlatform('" + sel.selectedPlatform + "'");
    }
    if (sel.selectedVideoPlatform && _VIDEO_PLATFORM_KEYS.indexOf(sel.selectedVideoPlatform) > -1) {
      selectedVideoPlatform = sel.selectedVideoPlatform;
      _restoreChipActive('#section-video .platform-chip', "selectVideoPlatform('" + sel.selectedVideoPlatform + "'");
    }
    if (sel.currentSearchSource) {
      // 旧快照里资讯聚合那一档存的是 'overseas'，映射到新键，
      // 不映射的话会被下面的 !== 'cn' 判断悄悄当成全网搜索，用户会以为切换失效。
      currentSearchSource = (sel.currentSearchSource === 'overseas') ? 'news' : sel.currentSearchSource;
      _restoreChipActive('.source-chip', "switchSearchSource('" + currentSearchSource + "'");
      var si = document.getElementById('searchInput');
      if (si) si.setAttribute('placeholder', t('hotspot.search.placeholder.' + currentSearchSource, si.placeholder));
    }
    // ---- 自由问答对话历史 ----
    // imgCount 反向还原成 images 数组占位（长度对但内容为空串）：fqRenderChat 里
    // safeUrl('') 返回空 → 走"图片刷新后未保留"那个分支，用户能看到确实发过图。
    if (Array.isArray(ws.fqHistory) && typeof fqHistory !== 'undefined') {
      fqHistory = ws.fqHistory.map(function(m) {
        var imgs = [];
        for (var n = 0; n < (m.imgCount || 0); n++) imgs.push('');
        return {
          role: (m.role === 'assistant' ? 'assistant' : 'user'),
          text: String(m.text || ''),
          images: imgs,
          sources: Array.isArray(m.sources) ? m.sources : [],
          modelName: m.modelName || '',
          searched: !!m.searched,
          isError: !!m.isError,
          ts: m.ts || 0
        };
      });
      if (typeof fqRenderChat === 'function') fqRenderChat();
    }

    console.log('[restoreWorkspace] 已恢复工作区（保存于 ' + new Date(ws.savedAt || 0).toLocaleString() + '）');
  } catch (e) {
    // 恢复失败绝不能挡住整个 App 启动 —— 宁可工作区是空的，也不能白屏
    console.warn('[restoreWorkspace] 恢复失败，跳过', e && e.message);
  }
}

// 按 onclick 里的参数找到对应的 chip 并高亮。
// chip 没有 data-value 属性，只能从 onclick 字符串里认，所以这里做成一个小工具，
// 三处复用；匹配不到就保持 HTML 里的默认高亮，不至于全都不亮。
function _restoreChipActive(selector, onclickNeedle) {
  var chips = document.querySelectorAll(selector);
  var hit = null;
  for (var i = 0; i < chips.length; i++) {
    var oc = chips[i].getAttribute('onclick') || '';
    if (oc.indexOf(onclickNeedle) !== -1) hit = chips[i];
  }
  if (!hit) return;
  for (var j = 0; j < chips.length; j++) chips[j].classList.remove('active');
  hit.classList.add('active');
}

// 输入即保存（2 秒防抖）。
// 用事件委托挂在 document 上，不逐个 addEventListener —— 动态生成的框（比如
// editScript() 里 innerHTML 出来的 #scriptEditor）绑不到，委托能覆盖。
// 2 秒是刻意选的：更短会在打字时反复打后端，更长则"打完最后一个字就刷新"会丢。
var _wsInputTimer = null;
function _onWorkspaceInput(e) {
  var el = e.target;
  if (!el || !el.id) return;
  var watched = WORKSPACE_INPUT_IDS.indexOf(el.id) !== -1
    || el.id === 'productDigest' || el.id === 'vcStoryboardEdit' || el.id === 'scriptEditor';
  if (!watched) return;
  persistWorkspaceSoon();
}

// 状态被代码改动（而不是用户打字）后调它。
// 典型场景：热点入口把 currentProductContext 置 null。只改内存的话，
// 万一这次生成中途失败、没走到任何一次保存，刷新后旧商品上下文就会从
// workspace 快照里复活 —— 用户会看到"我明明从热点进来的，怎么带着上次的商品"。
function persistWorkspaceSoon() {
  if (_wsInputTimer) clearTimeout(_wsInputTimer);
  _wsInputTimer = setTimeout(function() { _wsInputTimer = null; saveAppData(); }, 2000);
}

async function saveAppData() {
  if (!window.currentUser) return;   // 未登录不保存
  if (_saveAppDataPending) return;
  _saveAppDataPending = true;
  try {
    // 1) 图片落盘。
    //    ⚠️ 原来的条件是 dataUrl.indexOf('data:') === 0 —— 只处理 base64。
    //    但所有线上模型返回的都是 https:// 远程地址，所以这段代码在生产中
    //    **从未执行过**，DB 里每一行的 serverUrl 都是 null。改成"只要还不是本地就落盘"。
    for (var i = 0; i < generatedImages.length; i++) {
      var img = generatedImages[i];
      if (!img || img.serverUrl) continue;
      var iu = img.dataUrl || img.url || '';
      if (!iu || isLocalMediaUrl(iu)) continue;
      if (iu.indexOf('data:') === 0) {
        // base64：走原来的 /api/data/image
        try {
          var resp = await fetch('/api/data/image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: iu, title: img.title || 'AI image', platform: img.platform || '', model: img.model || '' })
          });
          var d = await resp.json();
          if (d && d.success) { img.serverUrl = d.url; img.serverId = d.id; img.dataUrl = d.url; }
        } catch (e) {}
      } else {
        // 远端 URL：由服务器抓回落盘
        var r = await persistMediaUrl(iu, 'image', { title: img.title, platform: img.platform, model: img.model });
        if (r) { img.serverUrl = r.url; img.serverId = r.id; img.remoteUrl = iu; img.dataUrl = r.url; }
      }
    }
    // 2) 视频落盘 —— 之前完全没有这一步，视频资产存的全是 24 小时后失效的厂商链接
    for (var v = 0; v < generatedVideos.length; v++) {
      var vid = generatedVideos[v];
      if (!vid || vid.serverUrl) continue;
      var vu = vid.url || '';
      if (!vu || isLocalMediaUrl(vu)) continue;
      var vr = await persistMediaUrl(vu, 'video', { title: vid.title, platform: vid.platform, model: vid.model });
      if (vr) { vid.serverUrl = vr.url; vid.serverId = vr.id; vid.remoteUrl = vu; vid.url = vr.url; vid.bytes = vr.bytes; }
    }
    // 3) 快照 3 个文本数组 + 图片元数据（图片只存引用 url，不存 base64）
    var imgMeta = generatedImages.map(function(im) {
      var o = {}; for (var k in im) { if (k !== 'dataUrl' || (im.dataUrl && im.dataUrl.indexOf('data:') !== 0)) o[k] = im[k]; }
      if (im.serverUrl) o.dataUrl = im.serverUrl;
      return o;
    });
    var appdata = { articles: generatedArticles, scripts: generatedScripts, videos: generatedVideos, images: imgMeta };
    // 4) 工作区快照（输入框 / 商品上下文 / 当前文章 / 选择态）
    try { appdata.workspace = captureWorkspace(); } catch (e) { console.warn('[saveAppData] captureWorkspace 失败', e && e.message); }
    await fetch('/api/data/appdata', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appdata: appdata })
    });
  } catch (e) {
    console.warn('[saveAppData] failed', e && e.message);
  } finally {
    _saveAppDataPending = false;
    if (window.currentUser && window.currentUser.role === 'admin') { try { saveIPStats(); } catch(e) {} }
  }
}

async function loadAppData() {
  if (!window.currentUser) return;
  try {
    var resp = await fetch('/api/data/appdata');
    var d = await resp.json();
    var a = (d && d.success && d.appdata) ? d.appdata : {};
    generatedArticles = Array.isArray(a.articles) ? a.articles : [];
    generatedScripts = Array.isArray(a.scripts) ? a.scripts : [];
    generatedVideos = Array.isArray(a.videos) ? a.videos : [];
    generatedImages = Array.isArray(a.images) ? a.images : [];
    window._pendingWorkspace = (a.workspace && typeof a.workspace === 'object') ? a.workspace : null;
  } catch (e) {
    generatedArticles = []; generatedScripts = []; generatedVideos = []; generatedImages = [];
    window._pendingWorkspace = null;
  }
  if (window.currentUser && window.currentUser.role === 'admin') { try { await loadIPStats(); } catch(e) {} }
  // 历史资产补救：老数据存的是厂商临时链接，趁它还没过期抓回本地。
  // 放到后台跑，不阻塞首屏。
  setTimeout(archiveLegacyMedia, 3000);
}

// 把历史遗留的厂商链接补抓到本地（一次只处理少量，避免开局打爆后端）
async function archiveLegacyMedia() {
  if (!window.currentUser) return;
  var todo = [];
  for (var v = 0; v < generatedVideos.length; v++) {
    var vd = generatedVideos[v];
    if (vd && vd.url && !vd.serverUrl && !isLocalMediaUrl(vd.url)) todo.push({ obj: vd, kind: 'video' });
  }
  for (var i = 0; i < generatedImages.length; i++) {
    var im = generatedImages[i];
    var iu = im && (im.dataUrl || im.url);
    if (im && iu && !im.serverUrl && !isLocalMediaUrl(iu) && iu.indexOf('http') === 0) todo.push({ obj: im, kind: 'image' });
  }
  if (!todo.length) return;
  console.log('[archiveLegacyMedia] 待归档历史资产 ' + todo.length + ' 条');
  var done = 0;
  for (var k = 0; k < todo.length && k < 12; k++) {   // 单次最多 12 条，剩下的下次进站再补
    var it = todo[k];
    var src = it.kind === 'video' ? it.obj.url : (it.obj.dataUrl || it.obj.url);
    var r = await persistMediaUrl(src, it.kind, { title: it.obj.title, platform: it.obj.platform, model: it.obj.model });
    if (r) {
      it.obj.serverUrl = r.url; it.obj.serverId = r.id; it.obj.remoteUrl = src;
      if (it.kind === 'video') it.obj.url = r.url; else it.obj.dataUrl = r.url;
      done++;
    } else {
      it.obj.expired = true;    // 抓不到就标记失效，渲染时给提示而不是显示破图
    }
  }
  if (done) {
    console.log('[archiveLegacyMedia] 已归档 ' + done + ' 条到本地磁盘');
    await saveAppData();
    try { renderAssetList(); } catch (e) {}
  }
}

// ⚠️ 第三个参数 search 之前漏了：HTML 里是 filterAssets(cat, null, this.value)，
// 而函数只声明两个形参 —— 搜索词被丢弃，currentAssetSearch 永远是空串，搜索框是坏的。
function filterAssets(category, el, search) {
  currentAssetCategory = category || 'all';
  if (typeof search === 'string') currentAssetSearch = search;
  var tabs = document.querySelectorAll('#assetTabs .asset-tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  if (el) {
    el.classList.add('active');
  } else {
    var map = { all:0, article:1, image:2, script:3, video:4, boom:5 };
    var t = tabs[map[category] || 0];
    if (t) t.classList.add('active');
  }
  renderAssetList();
  updateAssetBadge();
}

function renderAssetList() {
  var list  = document.getElementById('assetList');
  var empty = document.getElementById('assetEmpty');
  var searchWrap = document.getElementById('assetSearchWrap');
  var cat = currentAssetCategory;
  var q   = (currentAssetSearch || '').toLowerCase();

  var all = [];
  // 图文文章
  for (var i = 0; i < generatedArticles.length; i++) {
    var a = generatedArticles[i];
    if (!a.isBoomAnalysis) all.push({ type:'article', idx:i, title:a.title, date:a.date, platform:a.platform });
  }
  // 爆款拆解
  for (var i = 0; i < generatedArticles.length; i++) {
    var a = generatedArticles[i];
    if (a.isBoomAnalysis) all.push({ type:'boom', idx:i, title:a.title, date:a.date, platform:'爆款分析' });
  }
  // 短视频脚本
  for (var i = 0; i < generatedScripts.length; i++) {
    var s = generatedScripts[i];
    all.push({ type:'script', idx:i, title:s.title || '短视频脚本', date:s.date, platform:s.platform || '通用' });
  }
  // 短视频
  for (var i = 0; i < generatedVideos.length; i++) {
    var v = generatedVideos[i];
    all.push({ type:'video', idx:i, title:v.title || '短视频', date:v.date, platform:v.platform || '通用' });
  }
  // 图片资产
  for (var i = 0; i < generatedImages.length; i++) {
    var im = generatedImages[i];
    all.push({ type:'image', idx:i, title:im.title || ('AI生成图片 #' + (i+1)), date:im.date || '未知时间', platform:im.platform || 'MiniMax' });
  }

  var filtered = all.filter(function(it) {
    if (cat !== 'all' && it.type !== cat) return false;
    if (q && it.title.toLowerCase().indexOf(q) === -1) return false;
    return true;
  });

  filtered.sort(function(a, b) { return b.idx - a.idx; });

  if (filtered.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    searchWrap.style.display = 'none';
    return;
  }
  list.style.display = 'flex';
  empty.style.display = 'none';
  searchWrap.style.display = filtered.length > 3 ? 'block' : 'none';

  var iconMap  = { article:'📝', image:'🖼️', script:'🎬', video:'🎥', boom:'🔥' };
  var labelMap = { article:'图文文章', image:'图片', script:'短视频脚本', video:'短视频', boom:'爆款拆解' };

  // 图片资产：缩略图网格布局
  if (cat === 'image') {
    var gridHtml = '<div class="asset-image-grid">';
    for (var i = 0; i < filtered.length; i++) {
      var it = filtered[i];
      var img = generatedImages[it.idx];
      var imgSrc = img && img.dataUrl ? img.dataUrl : '';
      gridHtml += '<div class="asset-thumb" onclick="viewFullImage(' + it.idx + ')">'
        + (imgSrc
          ? '<img class="asset-thumb-img" src="' + imgSrc + '" alt="' + escapeHtml(it.title || '') + '" loading="lazy" />'
          : '<div class="asset-thumb-img" style="display:flex;align-items:center;justify-content:center;font-size:32px;">🖼️</div>')
        + '<div class="asset-thumb-meta">'
        + '<div class="asset-thumb-date">#' + (it.idx + 1) + ' · ' + (it.date || '') + '</div>'
        + '<div class="asset-thumb-actions">'
        + '<button onclick="event.stopPropagation();viewFullImage(' + it.idx + ')">🔍 查看</button>'
        + '<button class="btn-del" onclick="event.stopPropagation();deleteAsset(\'image\',' + it.idx + ')">🗑️ 删除</button>'
        + '</div>'
        + '</div>'
        + '</div>';
    }
    gridHtml += '</div>';
    list.innerHTML = gridHtml;
    list.style.display = 'block';
    return;
  }

  // ── 全部视图：图片缩略图网格 + 其他资产卡片 ──
  var imageItems = [];
  var nonImageItems = [];
  for (var i = 0; i < filtered.length; i++) {
    if (filtered[i].type === 'image') imageItems.push(filtered[i]);
    else nonImageItems.push(filtered[i]);
  }

  var html = '';

  // 图片缩略图网格
  if (imageItems.length > 0) {
    html += '<div class="asset-image-grid">';
    for (var i = 0; i < imageItems.length; i++) {
      var it = imageItems[i];
      var img = generatedImages[it.idx];
      var imgSrc = img && img.dataUrl ? img.dataUrl : '';
      html += '<div class="asset-thumb" onclick="viewFullImage(' + it.idx + ')">'
        + (imgSrc
          ? '<img class="asset-thumb-img" src="' + imgSrc + '" alt="' + escapeHtml(it.title || '') + '" loading="lazy" />'
          : '<div class="asset-thumb-img" style="display:flex;align-items:center;justify-content:center;font-size:32px;">🖼️</div>')
        + '<div class="asset-thumb-meta">'
        + '<div class="asset-thumb-date">#' + (it.idx + 1) + ' · ' + (it.date || '') + '</div>'
        + '<div class="asset-thumb-actions">'
        + '<button onclick="event.stopPropagation();viewFullImage(' + it.idx + ')">🔍 查看</button>'
        + '<button class="btn-del" onclick="event.stopPropagation();deleteAsset(\'image\',' + it.idx + ')">🗑️ 删除</button>'
        + '</div>'
        + '</div>'
        + '</div>';
    }
    html += '</div>';
  }

  // 非图片资产卡片
  for (var i = 0; i < nonImageItems.length; i++) {
    var it = nonImageItems[i];
    var previewHtml = '';
    var actionButtons = '';

    if (it.type === 'article' || it.type === 'boom') {
      // 文章/爆款：展示内容摘要
      var art = generatedArticles[it.idx];
      var snippet = '';
      if (art && art.content) {
        var plainText = art.content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        snippet = plainText.length > 200 ? plainText.substring(0, 200) + '...' : plainText;
      }
      previewHtml = '<div class="asset-text-preview">' + escapeHtml(snippet || it.title) + '</div>';
      actionButtons = '<button onclick="viewAsset(\'article\',' + it.idx + ')">📖 查看</button>'
        + '<button onclick="deleteAsset(\'article\',' + it.idx + ')" style="color:var(--red);">🗑️ 删除</button>';
    } else if (it.type === 'script') {
      // 脚本：展示内容摘要。脚本是纯文本存的，所以**不要**剥 <...> ——
      // 那会把 "<3s" 这类合法内容当标签吃掉。换行在摘要里压成空格是刻意的：
      // 卡片只有两行高度，保留 \n 反而会让摘要只剩一行时间轴。
      var scr = generatedScripts[it.idx];
      var sText = '';
      if (scr && scr.content) sText = String(scr.content).replace(/\s+/g, ' ').trim();
      previewHtml = '<div class="asset-text-preview">' + escapeHtml(sText.substring(0, 200) || it.title) + '</div>';
      actionButtons = '<button onclick="viewAsset(\'script\',' + it.idx + ')">📖 查看</button>'
        + '<button onclick="deleteAsset(\'script\',' + it.idx + ')" style="color:var(--red);">🗑️ 删除</button>';
    } else {
      // 视频：内嵌播放器。
      // ⚠️ 之前这里只输出一行「🎥 标题」文字，视频的 url 字段**从来没被渲染**，
      // 点「查看」也只是滚到视频区弹个 toast —— 用户以为"视频没保存"，
      // 其实是存了但看不见。现在直接放 <video controls>。
      var vd = generatedVideos[it.idx] || {};
      var vsrc = vd.serverUrl || vd.url || '';
      if (vsrc && !vd.expired) {
        previewHtml = '<video controls preload="metadata" playsinline style="width:100%;max-width:320px;border-radius:8px;background:#000;margin-top:6px;" src="' + safeUrl(vsrc) + '"></video>';
        if (!isLocalMediaUrl(vsrc)) {
          // 还没落盘，说明是厂商临时链接，明确告知
          previewHtml += '<div style="font-size:11px;color:var(--orange,#f59e0b);margin-top:4px;">⏳ 正在归档到本地，归档前此链接约 24 小时后失效</div>';
        }
      } else {
        previewHtml = '<div class="asset-text-preview">🎥 ' + escapeHtml(it.title)
          + (vd.expired ? '<br><span style="color:var(--red);font-size:11px;">⚠️ 原始链接已失效，未能归档到本地</span>' : '') + '</div>';
      }
      // 下载用 <a href> 而不是 onclick+window.open：safeUrl 返回的是**已转义**的
      // 属性值，塞进 JS 字符串会带上 &amp; 之类实体，链接就坏了。
      actionButtons = (vsrc && !vd.expired
          ? '<a href="' + safeUrl(vsrc) + '" download target="_blank" rel="noopener" style="display:inline-block;padding:6px 12px;font-size:12px;border-radius:6px;background:var(--bg-tertiary,#1f2937);color:var(--text-primary,#e5e7eb);text-decoration:none;">⬇️ 下载</a>'
          : '')
        + '<button onclick="deleteAsset(\'video\',' + it.idx + ')" style="color:var(--red);">🗑️ 删除</button>';
    }

    html += '<div class="asset-card">'
      + '<div class="asset-card-icon" style="background:rgba(99,102,241,0.1);color:var(--accent-light);">' + iconMap[it.type] + '</div>'
      + '<div class="asset-card-body">'
      + '<div class="asset-card-title">' + escapeHtml(it.title) + '</div>'
      + '<div class="asset-card-meta"><span>' + labelMap[it.type] + '</span><span>·</span><span>' + escapeHtml(it.platform) + '</span><span>·</span><span>' + it.date + '</span></div>'
      + previewHtml
      + '<div class="asset-card-actions" style="margin-top:8px;">' + actionButtons + '</div>'
      + '</div>'
      + '</div>';
  }
  list.innerHTML = html;
}

function copyAssetContent(type, idx) {
  var content = '';
  if (type === 'article' || type === 'boom') {
    content = generatedArticles[idx] ? (generatedArticles[idx].content || generatedArticles[idx].title) : '';
  } else if (type === 'script') {
    content = generatedScripts[idx] ? (generatedScripts[idx].content || generatedScripts[idx].title) : '';
  } else if (type === 'video') {
    content = generatedVideos[idx] ? (generatedVideos[idx].content || generatedVideos[idx].title) : '';
  } else if (type === 'image') {
    var img = generatedImages[idx];
    if (img && img.dataUrl) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(img.dataUrl.substring(0, 200) + '...').then(function() { showToast('图片链接已复制（截断）'); });
        return;
      }
    }
    showToast('图片不支持复制全文，请下载');
    return;
  }
  if (!content) { showToast('暂无内容可复制'); return; }
  // 文章是 HTML、脚本是纯文本 —— 只有前者需要剥标签。
  // 对脚本剥 <...> 会吃掉 "<3s" 这类合法字符，也会把换行一起弄丢。
  var plain;
  if (typeof content !== 'string') plain = String(content);
  else if (type === 'script') plain = content;
  else plain = content.replace(/<[^>]+>/g, '');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(plain).then(function() { showToast('✅ 已复制到剪贴板'); });
  } else {
    showToast('复制失败，请手动复制');
  }
}

function deleteAsset(type, idx) {
  if (!confirm('确定要删除这条资产吗？')) return;
  var gone = null;
  if (type === 'article' || type === 'boom') {
    generatedArticles.splice(idx, 1);
  } else if (type === 'script') {
    generatedScripts.splice(idx, 1);
  } else if (type === 'video') {
    gone = generatedVideos.splice(idx, 1)[0];
  } else if (type === 'image') {
    gone = generatedImages.splice(idx, 1)[0];
  }
  // 已落盘的媒体连磁盘文件一起清掉，否则删了记录、文件还占着盘。
  // serverUrl 形如 /api/data/media/12 或 /api/data/image/12，DELETE 同一地址即可；
  // 后端会先按 user_id 校验属主，删不到别人的东西。
  if (gone && gone.serverUrl && isLocalMediaUrl(gone.serverUrl)) {
    try { fetch(gone.serverUrl, { method: 'DELETE' }); } catch (e) {}
  }
  renderAssetList();
  // ⚠️ 之前这里只调 updateAssetBadge()，没保存 —— 删完 30 秒内刷新资产会"复活"
  flushAssets();
  showToast('已删除');
}

// 资产查看：文章/脚本直接弹窗读原文。
// ⚠️ 之前是 scrollToSection + 把内容塞进文章预览区 —— 会被下一次生成覆盖掉，
// 而且视频/图片只弹个 toast，等于点了没反应。
function viewAsset(type, idx) {
  var title = '', dateStr = '', platform = '', bodyHtml = '', plainForCopy = '';

  if (type === 'article' || type === 'boom') {
    var art = generatedArticles[idx];
    if (!art) { showToast('资产不存在'); return; }
    title = art.title || '未命名文章';
    dateStr = art.date || '';
    platform = art.platform || (art.isBoomAnalysis ? '爆款分析' : '');
    bodyHtml = art.content || '<p>（无内容）</p>';
    plainForCopy = String(art.content || '').replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } else if (type === 'script') {
    var scr = generatedScripts[idx];
    if (!scr) { showToast('资产不存在'); return; }
    title = scr.title || '短视频脚本';
    dateStr = scr.date || '';
    platform = scr.platform || '通用';
    // 脚本是**纯文本**存的（生成时取的 textContent），带 \n 换行和两空格缩进。
    // 之前直接当 HTML 塞进弹窗，浏览器把所有换行折叠成空格 —— 时间轴、VISUAL/VO/TEXT
    // 全挤成一坨。所以这里必须转义后用 pre-wrap 渲染：
    //   escapeHtml  → 模型偶尔会写出 <3s / <br> 这类尖括号，不转义就成了活标签（XSS 面）
    //   pre-wrap    → 保留 \n 和缩进，同时长行仍会自动折行（pre 不折行，窄屏会横向溢出）
    var scriptPlain = String(scr.content || '');
    bodyHtml = scriptPlain
      ? '<div style="white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.9;">'
        + escapeHtml(scriptPlain) + '</div>'
      : '<p>（无内容）</p>';
    plainForCopy = scriptPlain.trim();
  } else if (type === 'video') {
    var vd = generatedVideos[idx];
    if (!vd) { showToast('资产不存在'); return; }
    title = vd.title || '短视频';
    dateStr = vd.date || '';
    platform = vd.platform || '通用';
    var vs = vd.serverUrl || vd.url || '';
    bodyHtml = vs
      ? '<video controls autoplay playsinline style="width:100%;border-radius:10px;background:#000;" src="' + safeUrl(vs) + '"></video>'
      : '<p style="color:var(--red);">⚠️ 该视频链接已失效，且未能归档到本地。</p>';
    plainForCopy = '';
  } else if (type === 'image') {
    viewFullImage(idx);
    return;
  } else {
    return;
  }

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;';
  // 三条关闭路径共用：点遮罩、点 ✕/关闭按钮、按 ESC。可重复调用。
  var closeOverlay = function() {
    if (overlay.parentNode) document.body.removeChild(overlay);
    popEscLayer(overlay);
  };
  overlay.onclick = function(e) { if (e.target === overlay) closeOverlay(); };
  pushEscLayer(overlay, closeOverlay);

  var box = document.createElement('div');
  box.style.cssText = 'background:var(--bg-secondary,#111827);color:var(--text-primary,#e5e7eb);max-width:820px;width:100%;max-height:88vh;overflow:auto;border-radius:14px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.5);';

  var head = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:6px;">'
    + '<h2 style="font-size:20px;font-weight:700;margin:0;line-height:1.4;">' + escapeHtml(title) + '</h2>'
    + '<button data-act="close" style="flex:0 0 auto;background:none;border:none;color:var(--text-secondary,#9ca3af);font-size:22px;cursor:pointer;line-height:1;">✕</button>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--text-secondary,#9ca3af);margin-bottom:18px;">'
    + [platform, dateStr].filter(Boolean).map(escapeHtml).join(' · ')
    + '</div>';

  var foot = '<div style="display:flex;gap:10px;margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);">'
    + (plainForCopy ? '<button data-act="copy" style="padding:8px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:transparent;color:inherit;cursor:pointer;font-size:13px;">📋 复制全文</button>' : '')
    + (plainForCopy ? '<button data-act="download" style="padding:8px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:transparent;color:inherit;cursor:pointer;font-size:13px;">⬇️ 下载 .txt</button>' : '')
    + '<button data-act="close" style="padding:8px 16px;border-radius:8px;border:none;background:var(--accent,#6366f1);color:#fff;cursor:pointer;font-size:13px;margin-left:auto;">关闭</button>'
    + '</div>';

  // bodyHtml 是本站自己生成的文章 HTML（含排版标签），需要原样渲染
  box.innerHTML = head + '<div style="line-height:1.85;">' + bodyHtml + '</div>' + foot;

  box.addEventListener('click', function(e) {
    var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
    if (!act) return;
    if (act === 'close') {
      closeOverlay();
    } else if (act === 'copy') {
      if (navigator.clipboard) navigator.clipboard.writeText(plainForCopy).then(function() { showToast('✅ 已复制全文'); });
      else showToast('复制失败，请手动选择');
    } else if (act === 'download') {
      var blob = new Blob([plainForCopy], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (title || 'asset').replace(/[\\/:*?"<>|]/g, '_') + '.txt';
      a.click();
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 2000);
    }
  });

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// ============ ESC 关闭弹窗 ============
// 一个全局监听，而不是给 7 个弹窗各挂一个 keydown。理由：
// 1. 弹窗里的输入框/contenteditable 会吃掉冒泡不到 document 的按键，
//    挂在弹窗自己身上反而更容易漏；
// 2. 动态创建的弹窗（图片大图、资产详情）本来就没有固定的挂载点。
//
// ESC_MODALS 的顺序**就是关闭优先级**：靠后的先关。
// 弹窗之间存在真实的叠加关系（在「资产详情」里点图片会再叠一层大图预览），
// 一次 ESC 只关最上面那一层，符合用户预期。
// 每项声明自己的关法：有专用 close 函数的走函数（它们还要清定时器、
// 重置编辑态），没有的就直接摘掉节点。
var ESC_MODALS = [
  { id: 'editorModal',     close: function() { closeEditor(); } },
  { id: 'bindModal',       close: function() { closeBindModal(); } },
  { id: 'dashboardModal',  close: function() { closeDashboard(); } },
  { id: 'promptEditModal', close: function() { closePromptEdit(); } },
  { id: 'modelEditModal',  close: function() { closeModelEdit(); } }
];

// 动态弹窗没有固定 id，创建时往这里压一个 { el, close }，关掉后自己出栈。
var escDynamicStack = [];

function pushEscLayer(el, closeFn) {
  escDynamicStack.push({ el: el, close: closeFn });
}

function popEscLayer(el) {
  for (var i = escDynamicStack.length - 1; i >= 0; i--) {
    if (escDynamicStack[i].el === el) { escDynamicStack.splice(i, 1); return; }
  }
}

// 判断弹窗是不是真的显示在屏幕上。
// 两个坑都踩过，所以不能用那两个"看起来更简单"的写法：
// 1. **不能用 offsetParent**：按规范 position:fixed 的元素 offsetParent 恒为
//    null（跟显示与否无关），而这几个弹窗全是 fixed —— 那样判的话一个都关不掉。
// 2. **不能只看元素自己的 computed display**：computed display 不会因为父级
//    display:none 而变成 none。promptEditModal / modelEditModal 是挂在
//    section-prompts / section-models **里面**的，单页导航下用户切到别的页时
//    父 section 就是 display:none，此时弹窗自己仍然算 flex。只看自己的话，
//    一个用户根本看不见的弹窗会被当成"最上层"，ESC 打在空气上。
// 所以老老实实往上走到 body，任何一层 none 就算不可见。
// 这几个弹窗层级很浅（最深 3 层），成本可以忽略。
function isModalVisible(el) {
  for (var n = el; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).display === 'none') return false;
  }
  return true;
}

function closeTopmostModal() {
  // 动态层永远在静态弹窗之上（z-index 9999 vs 100/1000），所以先查它。
  while (escDynamicStack.length) {
    var top = escDynamicStack[escDynamicStack.length - 1];
    // 节点已经被别的路径摘掉了（点遮罩关的），丢弃这条陈旧记录继续往下找。
    if (!top.el || !top.el.parentNode) { escDynamicStack.pop(); continue; }
    escDynamicStack.pop();
    try { top.close(); } catch (e) {}
    return true;
  }
  for (var j = ESC_MODALS.length - 1; j >= 0; j--) {
    var m = document.getElementById(ESC_MODALS[j].id);
    if (m && isModalVisible(m)) {
      try { ESC_MODALS[j].close(); } catch (e) {}
      return true;
    }
  }
  return false;
}

function initEscToClose() {
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape' && e.keyCode !== 27) return;
    // 输入法候选窗打开时按 ESC 是"取消候选"，不该顺带关掉弹窗。
    // 中文输入是本站主场景，这一条必须挡。
    if (e.isComposing) return;
    if (closeTopmostModal()) {
      // 只有真的关掉了才拦事件，否则别妨碍其它 ESC 用法
      //（比如浏览器自身的行为、input 的清空）。
      e.preventDefault();
      e.stopPropagation();
    }
  });
}

function updateAssetBadge() {
  var total = generatedArticles.length + generatedScripts.length + generatedVideos.length + generatedImages.length;
  var badge = document.getElementById('nav-assets-badge');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-block' : 'none';
  }
}

// ============ INIT ============
function init() {
  // 单页导航：必须有且只有一个 section 处于 .active，否则整个工作区是空的。
  // HTML 里 24 个 section 都不带 .active（默认全隐藏），首页在这里点亮，
  // 与 nav-hotspot 上写死的 .active 保持一致。
  scrollToSection(currentSection);

  initEscToClose();

  // 与登录无关的静态 UI 先渲染（热点是公开内容）
  renderTopics(allHotspots);
  updateStats();
  updateTime();
  setInterval(updateTime, 60000);

  // 协议检测：file:// 协议下无法调用 API（CORS 限制）
  if (window.location.protocol === 'file:') {
    showToast('⚠️ 检测到本地文件打开方式，请通过 python server.py 启动后访问 http://localhost:8766');
    document.getElementById('authGate').style.display = 'none';
    return;
  }

  // 页面加载时重置左侧导航栏滚动位置
  var sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.scrollTop = 0;

  // 检查会话：未登录显示门禁，已登录加载用户数据
  checkAuthAndBoot();
}

// 登录后加载当前用户的数据并渲染（数据全部来自后端 API，按用户隔离）
async function bootAppData() {
  // 1) 预载用户配置缓存（提示词/模型/模块默认/账号），供同步访问器读取
  try {
    var pr = await (await fetch('/api/data/prompts')).json();
    window._userPromptsCache = (pr && pr.success && pr.prompts && pr.prompts.length) ? pr.prompts : null;
  } catch (e) { window._userPromptsCache = null; }
  try {
    var mr = await (await fetch('/api/data/models')).json();
    // 模型：按用户隔离，不复用管理员默认。空数组就是空（新用户需自行添加）
    window._userModelsCache = (mr && mr.success && Array.isArray(mr.models)) ? mr.models : [];
  } catch (e) { window._userModelsCache = []; }
  window._userModelsLoaded = true;
  try {
    var md = await (await fetch('/api/data/module_defaults')).json();
    window._moduleDefaultsCache = (md && md.success && md.defaults) ? md.defaults : {};
  } catch (e) { window._moduleDefaultsCache = {}; }
  try {
    var ac = await (await fetch('/api/data/accounts')).json();
    window._accountsCache = (ac && ac.success && Array.isArray(ac.accounts)) ? ac.accounts : [];
  } catch (e) { window._accountsCache = []; }

  // 2) 首次登录用户：seed 一份默认提示词（复用管理员最新提示词），但模型保持空（需用户自己添加）
  if (!window._userPromptsCache) {
    window._userPromptsCache = JSON.parse(JSON.stringify(defaultPrompts)).map(function(p){ return { id:p.id, module:p.module, name:p.name, content:p.content, language:p.language }; });
    savePrompts(window._userPromptsCache);
  }
  // 模型不做 seed：新用户模型列表为空，由其自行在「大模型配置」添加

  // 3) 重置缓存，强制下次 getPrompts/getModels 用新数据
  promptsCache = null; modelsCache = null;
  boundAccounts = loadAccounts();
  // 必须在 loadAccounts 之后、renderAccounts 之前：seed 会往 boundAccounts 里推数据
  if (typeof seedDemoAccountsIfNeeded === 'function') { try { seedDemoAccountsIfNeeded(); } catch(e) {} }

  // 4) 渲染
  if (typeof renderPromptList === 'function') { try { renderPromptList(); } catch(e){} }
  if (typeof renderModelList === 'function') { try { renderModelList(); } catch(e){} }
  if (typeof initModelPickers === 'function') { try { initModelPickers(); } catch(e){} }
  renderAccounts();
  initIPStats();
  await loadAppData();          // 从 /api/data/appdata 拉当前用户资产快照
  renderAssetList();
  updateAssetBadge();
  if (generatedImages.length > 0) renderImageResults();
  // ④⑤⑥ 恢复工作区。放在资产渲染之后：restoreWorkspace 会调 updateVideoSourceOptions()，
  // 它要读已经填好的 generatedArticles。
  if (window._pendingWorkspace) {
    restoreWorkspace(window._pendingWorkspace);
    window._pendingWorkspace = null;
  }
  // 自动保存：每 30 秒 + 关闭前（saveAppData 现在推送到后端）
  setInterval(saveAppData, 30000);
  window.addEventListener('beforeunload', saveAppData);
  // 输入即保存：2 秒防抖，事件委托覆盖动态生成的输入框
  document.addEventListener('input', _onWorkspaceInput, true);
  // 异步加载真实全网热点
  setTimeout(function() { refreshHotspots(); }, 500);
}
function updateTime() {
  var now = new Date();
  var hh = now.getHours().toString().padStart(2,'0');
  var mm = now.getMinutes().toString().padStart(2,'0');
  document.getElementById('update-time').textContent = hh + ':' + mm;
}
function updateStats() {
  // 全部使用当前显示的热点（搜索结果/分类筛选后），而非全库
  var currentView = displayedTopics.length > 0 ? displayedTopics : allHotspots;
  document.getElementById('statTotal').textContent = currentView.length;
  var maxH = currentView.length > 0 ? currentView.reduce(function(a, b) { return Math.max(a, b.hotness); }, 0) : 0;
  document.getElementById('statMaxHot').textContent = maxH.toFixed(1) + '万';
  // "匹配我的关注" = 当前视图中属于 AI技术+短视频+内容创作 三个分类的热点数量
  document.getElementById('statMatched').textContent = currentView.filter(function(t) { return t.cat === 'ai' || t.cat === 'short-video' || t.cat === 'content'; }).length;
  document.getElementById('statGenerated').textContent = generatedArticles.length;
}

// ============ HOTSPOT ============
function getHotnessClass(val) {
  if (val >= 85) return 'hotness-high';
  if (val >= 70) return 'hotness-mid';
  return 'hotness-low';
}
function getHotnessLabel(val) {
  if (val >= 90) return '爆';
  if (val >= 80) return '热';
  return '新';
}
function getCatLabel(cat) {
  var map = { 'ai':'AI技术', 'short-video':'短视频', 'content':'内容创作', 'platform':'平台动态', 'trend':'行业趋势', 'monetize':'变现运营' };
  return map[cat] || cat;
}
function escapeHtml(text) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// ⚠️ escapeHtml 走 textNode.innerHTML，它只转义 & < >，引号原样保留 ——
// 放进 title="..." / alt="..." 这类属性里就能被一个 " 提前闭合，从而注入 onerror 等事件。
// 凡是拼进 HTML 属性的值（尤其是抓取回来的第三方内容）必须用这个。
function escapeAttr(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 只允许 http/https/data:image 进 src/href，挡掉 javascript: / vbscript: / data:text/html。
// 抓取到的商品页 URL 与图片地址都来自外部站点，不能直接信任。
function safeUrl(url) {
  var s = String(url == null ? '' : url).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return escapeAttr(s);
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(s)) return escapeAttr(s);
  if (/^\//.test(s) && !/^\/\//.test(s)) return escapeAttr(s);   // 站内相对路径
  return '';
}

// 配图加载失败时的占位块。
// 为什么不像商品图那样 display:none 静默隐藏：文章配图**本来就应该有**，
// 悄悄藏掉会让用户以为"生成了但没显示"（用户原话是"图标只是个图标，被破坏了"——
// 那正是浏览器的默认破图标）。这里替换成一个写明原因的占位块，问题可见。
// 先置空 onerror 再替换，避免任何情况下递归触发。
var IMG_FALLBACK_ONERROR = "this.onerror=null;var d=document.createElement('div');"
  + "d.setAttribute('style','padding:24px 12px;border:1px dashed var(--border);border-radius:10px;"
  + "background:var(--bg-primary);color:var(--text-secondary);font-size:13px;text-align:center;line-height:1.6;');"
  + "d.textContent='\\u26a0\\ufe0f 配图加载失败（图片地址已过期或网络不可达）';"
  + "if(this.parentNode)this.parentNode.replaceChild(d,this);";

// 排序：完全匹配标题 > 部分匹配标题 > 匹配摘要 > 其他
function sortByRelevance(results, query) {
  var q = query.toLowerCase();
  return results.slice().sort(function(a, b) {
    var aTitle = a.title.toLowerCase();
    var bTitle = b.title.toLowerCase();
    var aSummary = a.summary.toLowerCase();
    var bSummary = b.summary.toLowerCase();
    var aScore = 0;
    var bScore = 0;
    if (aTitle.indexOf(q) !== -1) aScore = 3;
    else if (aSummary.indexOf(q) !== -1) aScore = 2;
    else aScore = 1;
    if (bTitle.indexOf(q) !== -1) bScore = 3;
    else if (bSummary.indexOf(q) !== -1) bScore = 2;
    else bScore = 1;
    if (aScore !== bScore) return bScore - aScore;
    return b.hotness - a.hotness;
  });
}

var displayedTopics = [];

// 把热点 id 安全地序列化成 inline onclick 里的字面量：数字原样，字符串加单引号并转义
function _hotspotIdArg(id) {
  if (typeof id === 'number' && isFinite(id)) return String(id);
  return "'" + String(id).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function renderTopics(topics) {
  displayedTopics = topics;
  var grid = document.getElementById('topicGrid');
  var empty = document.getElementById('topicEmpty');
  if (!grid) return;
  if (!topics || topics.length === 0) { grid.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';
  var html = '';
  for (var i = 0; i < topics.length; i++) {
    var t = topics[i];
    // ✅ 关键修复：id 可能是字符串（资讯聚合的 AI 卡片用 'ai-<ts>-<idx>' 这类 id）。
    // 之前直接拼进 onclick 未加引号，浏览器会把它当表达式求值 → ReferenceError，按钮全哑。
    var idArg = _hotspotIdArg(t.id);
    var hotnessClass = t.hotness >= 90 ? 'hotness-high' : t.hotness >= 75 ? 'hotness-mid' : 'hotness-low';
    var hotnessLabel = t.hotness >= 90 ? '🔥 爆' : t.hotness >= 75 ? '📈 热' : '💡 新';
    html += '<div class="topic-card animate-slide-up" style="animation-delay:' + (i * 0.05) + 's;">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<span class="topic-cat ' + t.cat + '">' + { ai: '🤖 AI技术', platform: '📱 平台动态', 'short-video': '🎬 短视频', content: '✍️ 内容创作', trend: '📊 行业趋势', monetize: '💰 变现策略' }[t.cat] + '</span>'
      + '<span style="font-size:11px;color:var(--text-secondary);">来源：' + escapeHtml(t.source || '未知') + '</span>'
      + '</div>'
      + '<span style="font-size:11px;color:var(--text-secondary);">' + (t.date || '未知时间') + '</span>'
      + '</div>'
      + '<h3 style="font-size:15px;font-weight:700;margin-bottom:8px;line-height:1.5;color:var(--text-primary);">' + escapeHtml(t.title) + '</h3>'
      + '<p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px;">' + escapeHtml(t.summary) + '</p>'
      + '<div>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'
      + '<div style="display:flex;align-items:center;gap:6px;">'
      + '<span style="font-size:11px;padding:0 6px;border-radius:3px;background:rgba(99,102,241,0.15);color:var(--accent-light);font-weight:600;">' + hotnessLabel + '</span>'
      + '<span style="font-size:13px;font-weight:600;color:var(--accent-light);">' + t.hotness + '万</span>'
      + '<span style="font-size:11px;color:var(--text-secondary);">热度</span>'
      + '</div>'
      + '<span style="font-size:11px;color:' + (t.sourceUrl && t.sourceUrl !== '#' ? 'var(--accent-light)' : 'var(--text-secondary)') + ';cursor:' + (t.sourceUrl && t.sourceUrl !== '#' ? 'pointer' : 'help') + ';text-decoration:underline;' + (t.sourceUrl && t.sourceUrl !== '#' ? '' : 'text-decoration-style:dotted;') + '" onclick="openSource(' + idArg + ')" title="' + (t.sourceUrl && t.sourceUrl !== '#' ? '打开外部链接' : '查看搜索提示') + '">查看来源' + (t.sourceUrl && t.sourceUrl !== '#' ? '' : ' 🔍') + '</span>'
      + '</div>'
      + '<div class="hotness-bar"><div class="hotness-fill ' + hotnessClass + '" style="width:' + t.hotness + '%;"></div></div>'
      + '<div style="display:flex;gap:8px;margin-top:12px;">'
      + '<button class="btn btn-primary btn-sm" style="flex:1;justify-content:center;" onclick="startArticleFromHotspot(' + idArg + ', event)">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/></svg>'
      + window.t('hotspot.card.gen_article', '以此话题生成文章') + '</button>'
      + '<button class="btn btn-primary btn-sm" style="flex:1;justify-content:center;background:linear-gradient(135deg,#8b5cf6,#6366f1);" onclick="startScriptFromHotspot(' + idArg + ', event)">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>'
      + window.t('hotspot.card.gen_script', '生成脚本+视频') + '</button>'
      + '<button class="btn btn-warning btn-sm" style="flex:1;justify-content:center;" onclick="startBoomAnalysis(' + idArg + ', event)">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
      + window.t('hotspot.card.boom', '爆款拆解') + '</button>'
      + '</div>'
      + '</div>'
      + '</div>';
  }
  grid.innerHTML = html;
}

// 打开热点来源链接
function openSource(topicId) {
  var t = _findHotspotById(topicId);
  if (!t) return;
  if (!t.sourceUrl || t.sourceUrl === '#') {
    showToast('📌 来源：' + t.source + ' — 请在「' + t.source + '」官网或App内搜索关键词：「' + t.title.substring(0, 25) + '…」', 5000);
    return;
  }
  // 验证URL格式
  if (t.sourceUrl.indexOf('http') !== 0) {
    showToast('📌 来源：' + t.source + ' — 请自行搜索查看原文', 4000);
    return;
  }
  window.open(t.sourceUrl, '_blank');
}

function getHotspotBaseList() {
  return isHotspotSearchMode && currentSearchResults.length > 0 ? currentSearchResults : allHotspots;
}

function filterTopics() {
  var query = document.getElementById('searchInput').value.toLowerCase().trim();
  var baseList = getHotspotBaseList();
  var filtered = baseList.slice();
  if (currentCategory !== 'all') {
    filtered = filtered.filter(function(t) { return t.cat === currentCategory; });
  }
  // 搜索态下切换分类时，baseList 已经是本次搜索结果，不再用输入框关键词二次过滤导致丢结果；非搜索态才做本地文本过滤。
  if (query && !isHotspotSearchMode) {
    filtered = filtered.filter(function(t) { return t.title.toLowerCase().indexOf(query) !== -1 || t.summary.toLowerCase().indexOf(query) !== -1; });
  }
  renderTopics(filtered);
  updateStats();
}

function filterByCategory(cat, el) {
  currentCategory = cat;
  var chips = document.querySelectorAll('#categoryFilters .chip');
  for (var i = 0; i < chips.length; i++) { chips[i].classList.remove('active'); }
  el.classList.add('active');
  // 非搜索态切换到某分类发现没有任何匹配条目时，按类别从本地池补条；搜索态保持本次搜索结果，不注入无关候选。
  if (cat !== 'all' && !isHotspotSearchMode) {
    var hasInCat = false;
    for (var k = 0; k < allHotspots.length; k++) { if (allHotspots[k].cat === cat) { hasInCat = true; break; } }
    if (!hasInCat) {
      // 从 webHotspotPool 找该分类，补 4 条进去
      try {
        var poolMatches = (typeof webHotspotPool !== 'undefined' ? webHotspotPool.filter(function(x){ return x.cat === cat; }) : []);
        for (var p = 0; p < Math.min(4, poolMatches.length); p++) {
          var clone = JSON.parse(JSON.stringify(poolMatches[p]));
          clone.id = nextWebId++;
          clone.date = '本地候选';
          allHotspots.push(clone);
        }
        if (poolMatches.length === 0) {
          // pool 里也没有 → 用 mock 兜底（基于分类名生成两条）
          var catLabels = { ai:'AI技术', platform:'平台动态', 'short-video':'短视频', content:'内容创作', trend:'行业趋势', monetize:'变现策略' };
          var label = catLabels[cat] || cat;
          for (var m = 0; m < 3; m++) {
            allHotspots.push({
              id: nextWebId++, cat: cat,
              title: label + '·热门话题 #' + (m+1),
              summary: label + '相关的热点话题尚在抓取中，可点击右上角刷新或在搜索框输入关键词获取实时数据。',
              hotness: 70 + Math.random()*20, source: '本地候选', sourceUrl: '#', date: '本地候选'
            });
          }
        }
      } catch(_){}
    }
  }
  filterTopics();
}

// 相关性正则：把用户的查询词拆成候选片段，命中任意一个就算相关。
// 中英文分开处理，因为两种语言的误放模式完全相反：
//   - 英文必须按词边界（\b）匹配。indexOf('cat') 会命中 category / education /
//     application，实测就是这么放进来一条 "Letterboxd or Strava for your brain" 的。
//   - 中文没有词边界可用，\b 在汉字两侧根本不成立（\b 只看 \w），
//     所以中文走子串匹配；2 字以上的中文片段本身已经足够具体，误放率低。
// 领域限定后缀（运营/趋势/榜单…）刻意不算作命中条件：它们几乎出现在所有行业文章里，
// 留着会让过滤形同虚设。
var _RELEVANCE_STOPWORDS = ['运营', '趋势', '榜单', '推荐', '测评', '复盘', '方案', '处罚', '新规', '短视频'];
function _buildRelevanceRe(query) {
  var raw = String(query || '').split(/[\s,，、\/|]+/).filter(Boolean);
  var cjk = [], ascii = [];
  for (var i = 0; i < raw.length; i++) {
    var w = raw[i];
    if (_RELEVANCE_STOPWORDS.indexOf(w) !== -1) continue;
    if (/[一-鿿぀-ヿ]/.test(w)) {
      if (w.length >= 2) cjk.push(w);
    } else if (w.length > 2) {
      ascii.push(w.toLowerCase());
    }
  }
  function esc(w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var parts = [];
  if (cjk.length) parts.push('(?:' + cjk.map(esc).join('|') + ')');
  if (ascii.length) parts.push('\\b(?:' + ascii.map(esc).join('|') + ')s?\\b');
  // 一个可用片段都没有（例如用户只打了「运营」）→ 返回 null = 不过滤。
  // 宁可放宽也不要因为过滤器过严把全部结果清空。
  if (!parts.length) return null;
  return new RegExp(parts.join('|'), 'i');
}

// ============ 搜索源切换：全网搜索 / 资讯聚合 ============
function switchSearchSource(source, el) {
  currentSearchSource = source;
  var chips = document.querySelectorAll('.source-chip');
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
  if (el) el.classList.add('active');
  var input = document.getElementById('searchInput');
  input.setAttribute('placeholder', t('hotspot.search.placeholder.' + source, input.placeholder));
  if (source === 'news') {
    showToast('📰 已切换到资讯聚合：AI 先出情报，再补真实参考链接');
  } else {
    showToast('🔍 已切换到全网搜索：先真抓 Bing / 百度，再由 AI 结构化');
  }
}

// ============ 全网搜索（先调本地 server.py 的 /api/web_search 真实抓 Bing/百度/搜狗，再交 AI 总结） ============
async function searchWebHotspots() {
  var query = document.getElementById('searchInput').value.trim();
  if (!query) { showToast('请输入搜索关键词'); document.getElementById('searchInput').focus(); return; }
  lastSearchQuery = query;

  document.getElementById('topicGrid').innerHTML = '';
  document.getElementById('topicEmpty').style.display = 'none';
  document.getElementById('topicLoading').style.display = 'block';
  var sourceLabel = currentSearchSource === 'news' ? 'AI 资讯聚合' : 'Bing / 百度 全网';
  document.getElementById('loadingText').textContent = '正在从 ' + sourceLabel + ' 抓取「' + query + '」相关热点...';
  document.getElementById('btnSearchWeb').disabled = true;

  // 资讯聚合分支：**主引擎为 AI 模型（下拉框选的文本模型，默认火山方舟）**，
  // 抓取源（Bing / 百度）作为参考补充。这样即便抓取腿被限流也不会空白。
  if (currentSearchSource === 'news') {
    document.getElementById('loadingText').textContent = '正在调用 AI 模型分析「' + query + '」的国内热点，同时并行抓取参考链接...';
    try {
      // ---- 并发：AI 生成 + 抓取参考源 ----
      var aiPromise = (async function() {
        // 领域锚定：只出「国内电商 + 国内自媒体运营」范围内的热点。
        // 不加这层限定时，模型会把关键词当泛话题理解 —— 搜 "AI" 给回一堆通用
        // 大模型新闻，搜 "选品" 给回投资选股，跟用户的行业完全不搭。
        // 八个方向对应用户明确点名的：行业动态、平台规则、爆款新闻、爆款商品、
        // 案例拆解、趋势数据、内容创作、各自媒体平台动态。
        var systemPrompt = '你是一位资深的国内电商 + 国内自媒体运营情报分析师。'
          + '你的领域**只有**国内电商运营与国内自媒体内容运营，别的都不出。'
          + '给你一个关键词，请输出 10 条当下的热点话题 —— 每一条都要是国内卖家 / 自媒体运营这周能据此动手的。\n\n'
          + '每条必须落在下面八个运营视角之一，10 条要分散在多个视角上：\n'
          + '1）行业动态 —— 平台与品牌方的动作、融资、类目结构变化\n'
          + '2）平台规则与合规 —— 各平台新规、处罚案例、广告与内容审核、直播合规、发票税务\n'
          + '3）爆款商品新闻 —— 现在什么在卖爆、为什么爆\n'
          + '4）具体爆品 —— 抖音商城 / 淘宝天猫 / 拼多多 / 京东 / 小红书商城 上正在走量的具体 SKU 或细分类目\n'
          + '5）案例拆解 —— 拆一个爆掉的账号或视频，把机制说明白（钩子、选题、投流、承接）\n'
          + '6）趋势与数据 —— 类目增速、千川/引力魔方 CPM、GMV 与转化率基准、季节性需求曲线\n'
          + '7）内容创作 —— 钩子写法、素人种草、达人 brief、短视频结构、标题与详情页文案\n'
          + '8）平台动态 —— 抖音、小红书、视频号、快手、B站、微博、淘宝天猫、拼多多、京东、微信公众号的算法 / 功能 / 变现规则变化\n\n'
          + '硬性要求：不要泛泛的 AI / 科技新闻，除非它直接改变电商或内容运营的做法。不要股票投资话题。不要海外市场话题（本站只做国内）。语境、平台、节点全部用国内的（618、双十一、年货节、直播间、千川、私域等）。\n\n'
          + '严格输出格式：只返回一个 JSON 数组，不要 markdown 围栏，不要任何解释文字。每个元素：\n'
          + '{"title": "话题标题", "summary": "50-100 字摘要，说清运营该怎么做", "cat": "ai|content|short-video|platform|trend|monetize", "hotness": 80-99, "source": "来源平台或媒体名，如 抖音电商 / 新榜 / 飞瓜数据 / 36氪 / 亿邦动力"}\n\n'
          + 'title 与 summary 一律用简体中文。优先给具体、能动手的话题，不要写空泛的行业口号。';
        var userPrompt = '关键词：' + query + '\n\n围绕这个关键词，返回 10 条国内电商 / 国内自媒体运营方向的热点，JSON 数组，只要 JSON。';
        var raw = await callModuleText('hotspot', systemPrompt, userPrompt);
        // 提取 JSON 数组
        var jsonStr = String(raw || '').trim();
        jsonStr = jsonStr.replace(/```json\n?|```\n?/gi, '').trim();
        var aStart = jsonStr.indexOf('[');
        var aEnd = jsonStr.lastIndexOf(']');
        if (aStart !== -1 && aEnd > aStart) jsonStr = jsonStr.substring(aStart, aEnd + 1);
        try {
          var arr = JSON.parse(jsonStr);
          if (Array.isArray(arr)) return arr;
        } catch (e) { console.warn('[HotspotAI] JSON parse fail, will fallback to line split:', e && e.message); }
        // 兜底：按行切
        var lines = String(raw || '').split(/\n{2,}/).filter(function(l) { return l.trim().length > 10; }).slice(0, 10);
        return lines.map(function(line) {
          return { title: line.replace(/^[\d\.\-\*\s]+/, '').substring(0, 120), summary: '', cat: 'trend', hotness: 82, source: 'AI-analysis' };
        });
      })().catch(function(e) {
        console.warn('[HotspotAI] failed:', e && e.message);
        return [];
      });
      // 超时保护：AI 429 一直重试会拖到很久，超时就快速降级到抓取源。
      // ⚠️ 不能设 8 秒（原值）：实测火山方舟生成 10 条 JSON 热点要 13~30+ 秒（4500 字符，
      // 同一提示词多次实测 12.8s / 21.7s / >30s，波动很大），8 秒必然超时 →
      // AI 卡永远是 0 条 → 中文搜索只剩抓取源那几条参考链接，正是用户报的
      // "搜出的东西和主题不匹配"。给到 60 秒覆盖长尾，同时下面更新提示文案，
      // 让用户知道是在等 AI 而不是卡死了。
      var aiTimeout = new Promise(function(resolve) { setTimeout(function() {
        console.warn('[HotspotAI] 60s timeout, falling back to scrape sources only');
        resolve([]);
      }, 60000); });
      aiPromise = Promise.race([aiPromise, aiTimeout]);
      // 等待期间刷新提示文案，避免用户以为页面卡住（AI 常态要 20 秒以上）
      var _waitTicks = 0;
      var _waitTimer = setInterval(function() {
        _waitTicks++;
        var el = document.getElementById('loadingText');
        if (el) el.textContent = 'AI 正在分析「' + query + '」的国内热点（约需 20-40 秒，已等待 '
          + (_waitTicks * 5) + ' 秒）...';
      }, 5000);

      // 抓取源（Bing 新闻 / Bing 网页 / 百度）作为参考链接。
      // 走 /api/web_search 而不是海外那条腿：后者打的是 HN/Reddit/NewsAPI，
      // 中文关键词在纯英文语料里命中率天然为 0。
      var scrapePromise = fetch('/api/web_search?q=' + encodeURIComponent(query) + '&count=10')
        .then(function(r) { return r.json(); })
        .catch(function() { return { success: false, results: [] }; });

      var aiResults = await aiPromise;
      clearInterval(_waitTimer);
      var osJson = await scrapePromise;
      var scrapeResults = (osJson && osJson.results) || [];

      // 合并策略：AI 生成的话题（提供 title/summary/cat/hotness），抓取源提供的话题（提供真实 sourceUrl）
      var validCats = ['ai','content','short-video','platform','trend','monetize'];
      var aiCards = aiResults.map(function(a, idx) {
        var cat = validCats.indexOf(a.cat || '') !== -1 ? a.cat : 'trend';
        // 尝试给 AI 卡关联一个真实抓取链接（按标题相似度粗匹配）
        var linked = null;
        if (scrapeResults.length) {
          var t = (a.title || '').toLowerCase();
          for (var si = 0; si < scrapeResults.length; si++) {
            var st = (scrapeResults[si].title || '').toLowerCase();
            if (t && st && (t.indexOf(st.slice(0, 20)) !== -1 || st.indexOf(t.slice(0, 20)) !== -1)) {
              linked = scrapeResults[si]; break;
            }
          }
        }
        return {
          id: 'ai-' + Date.now() + '-' + idx,
          cat: cat,
          title: String(a.title || '').slice(0, 180),
          summary: String(a.summary || '').slice(0, 400),
          hotness: Math.min(99, Math.max(70, parseFloat(a.hotness) || Math.round(90 - idx * 1.5))),
          source: (linked && linked.source) || (a.source || 'AI · Ark analysis'),
          sourceUrl: (linked && (linked.sourceUrl || linked.url)) || '#',
          date: (linked && linked.date) || 'just now',
          image: (linked && linked.image) || ''
        };
      });

      // 抓取源里未被 AI 关联到的真实链接单独作为参考卡片补进来（前 5 条）
      // ⚠️ 必须过滤相关性：搜索引擎在没有好结果时会退化成模糊相关度排序，
      // 返回一堆完全不相干的页面。用户报的"搜出的东西和文章主题不匹配"就是这个。
      // 宁可少给几张参考卡，也不能拿无关内容充数。
      var refRe = _buildRelevanceRe(query);
      function _refRelated(r) {
        if (!refRe) return true;
        return refRe.test((r.title || '') + ' ' + (r.summary || '') + ' ' + (r.snippet || ''));
      }
      var seenTitles = {};
      aiCards.forEach(function(c) { seenTitles[c.title.toLowerCase().slice(0, 40)] = true; });
      var referenceCards = [];
      var refDropped = 0;
      for (var ri = 0; ri < scrapeResults.length && referenceCards.length < 5; ri++) {
        var r = scrapeResults[ri];
        var key = (r.title || '').toLowerCase().slice(0, 40);
        if (!key || seenTitles[key]) continue;
        if (!_refRelated(r)) { refDropped++; continue; }
        seenTitles[key] = true;
        referenceCards.push({
          id: r.id || ('ref-' + Date.now() + '-' + ri),
          cat: validCats.indexOf(r.cat || '') !== -1 ? r.cat : 'trend',
          title: r.title,
          summary: r.summary || '',
          hotness: r.hotness || 78,
          source: r.source || 'Reference',
          sourceUrl: r.sourceUrl || r.url || '#',
          date: r.date || 'recently',
          image: r.image || ''
        });
      }
      if (refDropped) console.log('[NewsSearch] dropped ' + refDropped + ' off-topic reference link(s)');

      var fresh = aiCards.concat(referenceCards);
      var poolFallbackEmpty = false;
      if (fresh.length === 0) {
        // AI 超时/限流 + 抓取源全部无相关结果 → 本地热点池匹配兜底
        console.warn('[NewsSearch] AI+scrape both failed, falling back to local pool match');
        var localPool = (typeof webHotspotPool !== 'undefined') ? webHotspotPool : [];
        var poolRe = refRe;
        var matched = [];
        for (var pi = 0; pi < localPool.length; pi++) {
          var p = localPool[pi];
          if (!poolRe || poolRe.test((p.title || '') + ' ' + (p.summary || ''))) matched.push(p);
        }
        // ⚠️ 匹配不到就**不要**拿整个离线池充数（原来是 `matched = localPool`）：
        // 用户搜"智能猫砂盆"却看到一屏"知识付费"，正是他报的"和主题不匹配"。
        // 空结果 + 说明原因，比一屏不相干内容诚实得多。
        if (matched.length === 0) poolFallbackEmpty = true;
        fresh = matched.slice(0, 10).map(function(p, idx) {
          return {
            id: 'pool-' + (p.id || idx) + '-' + Date.now(),
            cat: p.cat || 'trend',
            title: p.title,
            summary: p.summary || '',
            hotness: p.hotness || 85,
            source: (p.source || 'Local pool') + ' · 离线匹配',
            sourceUrl: (p.sourceUrl || p.url) !== '#' ? (p.sourceUrl || p.url) : '#',
            date: p.date || 'recently',
            image: p.image || ''
          };
        });
      }

      allHotspots = fresh.concat(allHotspots).slice(0, 30);
      currentSearchResults = fresh;
      isHotspotSearchMode = true;
      renderTopics(fresh);
      updateStats();
      document.getElementById('topicLoading').style.display = 'none';
      document.getElementById('btnSearchWeb').disabled = false;
      var usedLocalPool = (aiCards.length === 0 && referenceCards.length === 0);
      if (poolFallbackEmpty) {
        // 说实话：AI 超时 + 抓取源也没有这个题材的内容。给出可执行的下一步，
        // 而不是塞一屏无关结果假装有货。
        showToast('⚠️ AI 模型超时，且抓取源没有「' + query + '」的相关内容。'
          + '建议：重试一次（AI 通常 20-40 秒出结果），或换一个更具体的领域词（如「抖音爆款商品 榜单」），或切换「🔍 全网搜索」源。');
      } else {
        showToast(usedLocalPool
          ? '⚠️ AI 与抓取源均限流/失败，已改用本地热点池做关键词匹配（' + fresh.length + ' 条）。请稍后重试以获得 AI 生成的实时结果。'
          : '📰 已获取 ' + fresh.length + ' 条热点（AI ' + aiCards.length + ' 条 + 参考链接 ' + referenceCards.length + ' 条 · ' + modelNameById(getPickedModelId('hotspot')) + '）');
      }
      return;
    } catch (e) {
      clearInterval(_waitTimer);
      console.error('[NewsSearch] AI+scrape both failed:', e);
      document.getElementById('topicLoading').style.display = 'none';
      document.getElementById('btnSearchWeb').disabled = false;
      showToast('⚠️ 资讯聚合失败：' + (e && e.message || '未知错误'));
      return;
    }
  }

  try {
    var fetched = [];
    // Step 1: 真实抓取搜索引擎结果
    var realResults = [];
    var enginesDown = false;
    try {
      var searchResp = await fetch('/api/web_search?q=' + encodeURIComponent(query) + '&count=10');
      if (searchResp.ok) {
        var sjson = await searchResp.json();
        if (sjson.results && sjson.results.length > 0) realResults = sjson.results;
        enginesDown = !!sjson.engines_down;
      }
    } catch(se) { console.log('[Search] /api/web_search 失败:', se.message); }

    // Step 1.5: 国内源的**领域兜底**（电商 / 社媒运营）。
    // 为什么不直接把 "电商运营" 拼进 query 一起搜：Bing 是 AND 语义，多一个词就把
    // 结果面收窄。实测「选品」单独搜回 10 条全是跨境电商选品实操，拼成「选品 电商运营」
    // 只剩 6 条且更泛 —— 无条件拼接是净损失。
    // 所以改成"先按原词搜，不够领域相关才补一发"：
    //   ① 用 _cnDomainHit 数一下有多少条命中电商/社媒运营信号词；
    //   ② 少于 4 条才追加一次 `query + 电商运营` 的搜索并按标题去重合并；
    //   ③ 最后把领域相关的排到前面（稳定排序），让默认视图就是本行业内容。
    // 这样「电商选品」这类本来就够领域的词零额外开销，「猫砂盆」这种泛词才多花一次请求。
    function _cnDomainHit(r) {
      var s = ((r.title || '') + ' ' + (r.snippet || r.summary || '') + ' ' + (r.source || ''));
      return /电商|跨境|选品|带货|直播|店铺|卖家|运营|营销|种草|达人|私域|爆款|转化|GMV|客单|流量|抖音|快手|小红书|视频号|拼多多|淘宝|天猫|京东|微信|微博|平台规则|新规/i.test(s);
    }
    var domainHits = realResults.filter(_cnDomainHit).length;
    if (!enginesDown && domainHits < 4 && !/电商|跨境|运营|营销|社媒/.test(query)) {
      try {
        document.getElementById('loadingText').textContent = '结果偏离电商/社媒运营领域，正在追加一次领域限定搜索...';
        var augQ = query + ' 电商运营';
        var augResp = await fetch('/api/web_search?q=' + encodeURIComponent(augQ) + '&count=10');
        if (augResp.ok) {
          var ajson = await augResp.json();
          var seenAug = {};
          realResults.forEach(function(r) { seenAug[String(r.title || '').replace(/\s+/g, '')] = true; });
          (ajson.results || []).forEach(function(r) {
            var k = String(r.title || '').replace(/\s+/g, '');
            if (!k || seenAug[k]) return;
            seenAug[k] = true;
            realResults.push(r);
          });
          console.log('[Search] 领域兜底追加：' + augQ + ' → 合并后 ' + realResults.length + ' 条');
        }
      } catch (ae) { console.log('[Search] 领域兜底搜索失败:', ae && ae.message); }
    }
    // 领域相关的排前面。用 filter 两段拼接而不是 sort：sort 的比较函数在
    // 相等项上不保证稳定（老引擎），会把搜索引擎本来的相关度排序打乱。
    if (realResults.length > 1) {
      realResults = realResults.filter(_cnDomainHit).concat(realResults.filter(function(r) { return !_cnDomainHit(r); }));
    }

    // Step 2: 把真实搜索结果映射成话题卡片
    if (realResults.length > 0) {
      document.getElementById('loadingText').textContent = '已抓到 ' + realResults.length + ' 条原始结果，正在结构化...';
      // 分类规则：按更强语义优先级判断，避免所有结果因出现 AI 字样都归到 AI技术
      function guessCat(title, snippet, source) {
        var t = (title + ' ' + snippet + ' ' + (source || '')).toLowerCase();
        if (/变现|赚钱|引流|带货|私域|商业化|收益|接单|电商|广告/.test(t)) return 'monetize';
        if (/抖音|快手|视频号|短视频|tiktok|b站|bilibili|直播|漫剧|短剧|剧集|影视|播放|剪辑/.test(t)) return 'short-video';
        if (/小红书|公众号|知乎|微博|微信|平台|app|社区|账号/.test(t)) return 'platform';
        if (/创作|写作|文案|内容|爆款|选题|标题|脚本|笔记|图文/.test(t)) return 'content';
        if (/趋势|报告|增长|预测|2026|行业|市场|数据|规模|白皮书/.test(t)) return 'trend';
        if (/\bai\b|gpt|大模型|算法|机器学习|llm|aigc|智能体|模型|生成式/.test(t)) return 'ai';
        return 'content';
      }
      for (var i = 0; i < realResults.length; i++) {
        var r = realResults[i];
        var cat = guessCat(r.title || '', r.snippet || r.summary || '', r.source || '');
        fetched.push({
          id: nextWebId++,
          cat: cat,
          title: (r.title || '搜索结果 #' + (i+1)).substring(0, 80),
          summary: (r.snippet || r.summary || '').substring(0, 200) || '点击"查看来源"打开原始网页查看完整内容。',
          hotness: Math.round((85 - i * 1.5) * 10) / 10,
          source: r.source || (r.url && r.url.match(/https?:\/\/([^\/]+)/) ? r.url.match(/https?:\/\/([^\/]+)/)[1] : '全网'),
          sourceUrl: r.url || '#',
          date: '刚刚'
        });
      }
    } else {
      // 真实搜索失败时不再伪装成全网真实热点，明确展示空结果。
      // 区分"引擎全挂"和"这个词没结果"：前者让用户换关键词是白费功夫
      // （百度已对机房 IP 上人机验证，Bing 也可能被限流），得说实话。
      fetched = [];
      showToast(enginesDown
        ? '⚠️ 搜索引擎暂时不可用（可能被限流或触发人机验证），与关键词无关，请稍后重试或切换「📰 资讯聚合」源'
        : '未抓取到可验证的真实搜索结果，请换一个关键词或稍后再试');
    }

    // 关键词强相关过滤：标题或摘要必须命中关键词
    // ⚠️ 必须去掉空白再比：搜索引擎会把命中词包在 <strong> 里高亮，后端剥标签时
    // 曾经换成空格，`智能猫砂盆` 就变成 `智能 猫砂盆`，用原词 indexOf 必然 0 命中
    // （用户报的"国内搜不出东西"）。后端已修，这里再做一层规范化兜底：
    // 中文分词没有空格可依，只要 hay 去空白后包含 query 去空白就算命中。
    function _nows(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
    var qLower = query.toLowerCase();
    var qNoWs = _nows(query);
    var qParts = qLower.split(/\s+/).filter(Boolean);
    var related = fetched.filter(function(t) {
      var hay = (t.title + ' ' + t.summary).toLowerCase();
      var hayNoWs = _nows(hay);
      if (qNoWs && hayNoWs.indexOf(qNoWs) !== -1) return true;
      // 任一关键词命中即保留（英文多词查询走这条）
      for (var qi = 0; qi < qParts.length; qi++) {
        if (hay.indexOf(qParts[qi]) !== -1) return true;
        if (hayNoWs.indexOf(_nows(qParts[qi])) !== -1) return true;
      }
      return false;
    });
    // 如果关键词强过滤后过少，说明搜索引擎摘要可能缺失；保留真实抓取结果，但不生成假数据
    if (related.length < 3 && fetched.length > 0) {
      related = fetched.slice(0, 8);
    }

    // 二次质量校验：标题和摘要去重，避免同一摘要铺满整屏
    var uniqueRelated = [];
    var seenT = {};
    var seenS = {};
    for (var ui = 0; ui < related.length; ui++) {
      var item = related[ui];
      var tk = (item.title || '').replace(/\s+/g, '').toLowerCase();
      var sk = (item.summary || '').replace(/\s+/g, '').toLowerCase().substring(0, 80);
      if (seenT[tk]) continue;
      if (sk && seenS[sk]) continue;
      seenT[tk] = true;
      if (sk) seenS[sk] = true;
      uniqueRelated.push(item);
    }
    related = uniqueRelated;

    // 合并到 allHotspots（去重：按标题）
    var existingTitles = {};
    allHotspots.forEach(function(t) { existingTitles[t.title] = true; });
    for (var ii = 0; ii < related.length; ii++) {
      if (!existingTitles[related[ii].title]) {
        existingTitles[related[ii].title] = true;
        allHotspots.unshift(related[ii]);
      }
    }
    if (allHotspots.length > 30) allHotspots = allHotspots.slice(0, 30);

    currentSearchResults = related.slice();
    isHotspotSearchMode = true;
    document.getElementById('topicLoading').style.display = 'none';
    document.getElementById('btnSearchWeb').disabled = false;
    currentCategory = 'all';
    var chips = document.querySelectorAll('#categoryFilters .chip');
    for (var j = 0; j < chips.length; j++) { chips[j].classList.remove('active'); }
    chips[0].classList.add('active');
    renderTopics(currentSearchResults);
    updateStats();
    showToast('全网搜索完成，找到 ' + related.length + ' 条与「' + query + '」相关的真实结果，可继续切换分类查看');
  } catch(e) {
    document.getElementById('topicLoading').style.display = 'none';
    document.getElementById('btnSearchWeb').disabled = false;
    showToast('⚠️ 搜索异常：' + (e.message || '请稍后重试'));
    renderTopics(allHotspots);
    updateStats();
  }
}

function generateMockHotspots(query) {
  var templates = [
    { cat: 'ai', suffix: '：AI赋能下的新机遇', source: '36氪', hotRange: [80, 96] },
    { cat: 'content', suffix: '：2026年创作者必须知道的方法论', source: '人人都是产品经理', hotRange: [70, 90] },
    { cat: 'short-video', suffix: '：短视频运营全攻略', source: '飞瓜数据', hotRange: [75, 93] },
    { cat: 'platform', suffix: '：平台新功能详解', source: '新榜', hotRange: [65, 88] },
    { cat: 'monetize', suffix: '：从0到1的变现路径', source: '创业邦', hotRange: [72, 92] },
    { cat: 'trend', suffix: '：2026年行业深度解读', source: '艾瑞咨询', hotRange: [78, 97] }
  ];
  var results = [];
  var count = 2 + Math.floor(Math.random() * 3);
  for (var i = 0; i < count; i++) {
    var tmpl = templates[Math.floor(Math.random() * templates.length)];
    var hotness = tmpl.hotRange[0] + Math.random() * (tmpl.hotRange[1] - tmpl.hotRange[0]);
    hotness = Math.round(hotness * 10) / 10;
    results.push({
      id: nextWebId++, cat: tmpl.cat,
      title: query + tmpl.suffix,
      summary: '基于全网数据分析，「' + query + '」相关内容在2026年持续升温。本文从实战角度深入解析最新方法论，帮助创作者快速抓住这一轮内容红利。数据显示，相关关键词搜索量环比增长超过80%。',
      hotness: hotness, source: tmpl.source, sourceUrl: '#', date: '刚刚'
    });
  }
  return results;
}

// 通过 MiniMax API 获取真实全网热点
var _hotspotCache = { ts: 0, key: '', data: null };
var HOTSPOT_TTL_MS = 10 * 60 * 1000;  // 10 分钟内重复加载不再调 AI，直接用缓存，避免烧配额触发 429

async function fetchRealHotspots(contextQuery, count) {
  count = count || 10;
  var cacheKey = (contextQuery || '') + '|' + count;
  var now = Date.now();
  if (_hotspotCache.data && _hotspotCache.key === cacheKey && (now - _hotspotCache.ts) < HOTSPOT_TTL_MS) {
    console.log('[Hotspot] using cached results (' + Math.round((now - _hotspotCache.ts) / 1000) + 's old), skip AI call');
    return _hotspotCache.data.map(function(it) { return Object.assign({}, it, { id: nextWebId++ }); });
  }
  var currentDate = new Date().toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' });
  var _domainZh = '国内电商与国内自媒体运营（覆盖行业动态、平台新规、爆款商品、爆款拆解、趋势数据、内容创作、达人合作与私域运营）';
  var _platformsZh = '抖音、小红书、视频号、快手、B站、微博、微信公众号、今日头条、淘宝天猫、拼多多、京东';
  var systemPrompt = '你是一个聚焦「' + _domainZh + '」的实时热点情报系统。'
    + '你只输出该领域内、运营人员本周能据此采取行动的热点，不要输出与电商/自媒体运营无关的泛科技或财经新闻，也不要输出海外市场话题。'
    + '\n\n重要格式要求：你必须严格按照以下JSON数组格式返回，每个元素是一个热点对象，不要包含任何markdown标记或额外文字：\n[{"title":"话题标题","summary":"话题摘要（50-100字，说清运营该怎么做）","cat":"ai/content/short-video/platform/trend/monetize 之一","hotness":80-99的数字,"source":"来源平台名"}]'
    + '\n语言要求：title 与 summary 一律用简体中文，语境与节点全部用国内的（618、双十一、年货节、直播间、千川、私域等）。';

  var userPrompt = contextQuery
    ? '请返回 ' + count + ' 条与"' + contextQuery + '"相关的' + _domainZh + '最新热点话题。日期：' + currentDate + '。要求：覆盖不同平台（' + _platformsZh + '），现实主义风格，每条话题要有真实的来源出处。'
    : '今天是' + currentDate + '，请返回 ' + count + ' 条' + _domainZh + '方向最新最热的话题。要求：覆盖不同平台（' + _platformsZh + '），现实主义风格，每条话题要有真实的来源出处。类别分布尽量分散（ai、content、short-video、platform、trend、monetize）。';

  try {
    // 走模块级分发器：热点模块下拉框选的文本模型优先 + 跨模型降级 + 429 退避重试
    var rawText = await callModuleText('hotspot', systemPrompt, userPrompt);
    var jsonStr = rawText.trim();
    // 清理可能的 markdown 包裹
    if (jsonStr.indexOf('```') !== -1) {
      var match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
    }
    // 尝试找到 JSON 数组
    var arrStart = jsonStr.indexOf('[');
    var arrEnd = jsonStr.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
      jsonStr = jsonStr.substring(arrStart, arrEnd + 1);
    }
    var items = JSON.parse(jsonStr);
    if (!Array.isArray(items) || items.length === 0) throw new Error('Empty result');
    
    var results = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var cat = item.cat || 'ai';
      // 验证分类有效性
      var validCats = ['ai','content','short-video','platform','trend','monetize'];
      if (validCats.indexOf(cat) === -1) cat = 'ai';
      results.push({
        id: nextWebId++,
        cat: cat,
        title: item.title || '未知标题',
        summary: item.summary || item.desc || '',
        hotness: Math.min(99.9, Math.max(60, parseFloat(item.hotness) || Math.floor(75 + Math.random() * 25))),
        source: item.source || '全网热搜',
        sourceUrl: '#',
        date: '刚刚'
      });
    }
    // 写入缓存（深拷贝快照，避免外部 id 复写污染）
    _hotspotCache = { ts: Date.now(), key: cacheKey, data: results.map(function(r) { return Object.assign({}, r); }) };
    return results;
  } catch(e) {
    console.log('Hotspot AI fetch failed, using local data:', e.message);
    // 失败时用本地 pool + mock 兜底
    var fallback = [];
    var poolCopy = webHotspotPool.slice();
    for (var p = poolCopy.length - 1; p > 0; p--) {
      var j = Math.floor(Math.random() * (p + 1));
      var temp = poolCopy[p]; poolCopy[p] = poolCopy[j]; poolCopy[j] = temp;
    }
    for (var k = 0; k < Math.min(count, poolCopy.length); k++) {
      var item = JSON.parse(JSON.stringify(poolCopy[k]));
      item.id = nextWebId++;
      item.date = '刚刚';
      fallback.push(item);
    }
    if (fallback.length === 0) {
      fallback = generateMockHotspots(contextQuery || '自媒体电商运营');
    }
    return fallback;
  }
}

// 全网刷新：通过 MiniMax API 拉取真实全网热点
async function refreshHotspots() {
  document.getElementById('topicGrid').innerHTML = '';
  document.getElementById('topicEmpty').style.display = 'none';
  document.getElementById('topicLoading').style.display = 'block';
  document.getElementById('loadingText').textContent = '正在通过 AI 实时抓取全网热点数据...';
  var refreshBtn = document.querySelector('button[onclick="refreshHotspots()"]');
  if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.style.opacity = '0.6'; }

  try {
    var newItems = await fetchRealHotspots(null, 12);
    // 合并到 allHotspots（去重：按标题相似）
    var existingTitles = {};
    allHotspots.forEach(function(t) { existingTitles[t.title] = true; });
    for (var i = 0; i < newItems.length; i++) {
      if (!existingTitles[newItems[i].title]) {
        existingTitles[newItems[i].title] = true;
        allHotspots.unshift(newItems[i]);
      }
    }
    // 保持在合理数量
    if (allHotspots.length > 30) allHotspots = allHotspots.slice(0, 30);
    
    document.getElementById('topicLoading').style.display = 'none';
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.style.opacity = '1'; }
    currentCategory = 'all';
    var chips = document.querySelectorAll('#categoryFilters .chip');
    for (var p = 0; p < chips.length; p++) { chips[p].classList.remove('active'); }
    chips[0].classList.add('active');
    document.getElementById('searchInput').value = '';
    lastSearchQuery = '';
    currentSearchResults = [];
    isHotspotSearchMode = false;
    renderTopics(allHotspots);
    updateStats();
    updateTime();
    showToast('✅ AI 已实时抓取 ' + newItems.length + ' 条全网最新热点');
  } catch(e) {
    document.getElementById('topicLoading').style.display = 'none';
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.style.opacity = '1'; }
    showToast('⚠️ 网络异常，使用本地热点数据');
    renderTopics(allHotspots);
    updateStats();
  }
}

// ============ ARTICLE GENERATION ============
// 立即响应点击的助手：先给发起按钮加 loading 态，让用户看到反馈；再用 rAF 在下一帧启动生成
function _nextFrameThen(fn) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function() { requestAnimationFrame(fn); });
  } else {
    setTimeout(fn, 16);
  }
}
function _flashClickedButton(evt) {
  try {
    var t = evt && (evt.currentTarget || evt.target);
    if (!t) return;
    var btn = t.closest ? t.closest('button') : t;
    if (btn && btn.style) {
      btn.dataset._origHtml = btn.innerHTML;
      btn.innerHTML = '<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:currentColor;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> ' + (window.currentLang === 'en' ? 'Working...' : '处理中...');
      btn.style.opacity = '0.8';
      // 3 秒后自动复原，避免卡在"处理中..."无法再次点击
      setTimeout(function() { _restoreClickedButton(btn); }, 3000);
    }
  } catch (e) {}
}
function _restoreClickedButton(btn) {
  try {
    if (btn && btn.dataset && btn.dataset._origHtml) {
      btn.innerHTML = btn.dataset._origHtml;
      delete btn.dataset._origHtml;
      btn.style.opacity = '1';
    }
  } catch (e) {}
}

// 统一的热点查找：先查 allHotspots，再兜底查搜索结果 / 当前渲染列表，最后按 String 松散比较。
// 之前只扫 allHotspots 且用严格 ===，搜索出来的卡片经常查不到 → 按钮静默失效。
function _findHotspotById(id) {
  var pools = [allHotspots, (window.currentSearchResults || []), (displayedTopics || [])];
  var k;
  for (k = 0; k < pools.length; k++) {
    var pool = pools[k] || [];
    for (var i = 0; i < pool.length; i++) {
      if (pool[i] && pool[i].id === id) return pool[i];
    }
  }
  for (k = 0; k < pools.length; k++) {
    var pool2 = pools[k] || [];
    for (var j = 0; j < pool2.length; j++) {
      if (pool2[j] && String(pool2[j].id) === String(id)) return pool2[j];
    }
  }
  return null;
}

function startArticleFromHotspot(id, evt) {
  var topic = _findHotspotById(id);
  if (!topic) { showToast(window.currentLang === 'en' ? 'Topic not found, please search again' : '未找到该热点，请重新搜索'); return; }
  _flashClickedButton(evt);
  // 切换入口：清掉商品上下文，避免两条入口污染同一次生成
  currentProductContext = null;
  persistWorkspaceSoon();   // 置 null 也要落盘，否则刷新后旧商品会从 workspace 快照复活
  scrollToSection('article');
  document.getElementById('articleTopic').value = topic.title;
  // 把热点摘要一起带过去：标题往往只有几个词，摘要才有具体的产品/人物/场景，
  // 而配图简报正需要这些具体名词。对照 startScriptFromHotspot 一直是带 summary 的。
  window._hotspotContext = {
    title: topic.title,
    summary: topic.summary || '',
    sourceUrl: (topic.sourceUrl && topic.sourceUrl !== '#') ? topic.sourceUrl : ''
  };
  _nextFrameThen(function() { generateArticle(); });
}

// 热点 → 脚本+视频（与商品入口对称，走同一条 generateScript 链路）
function startScriptFromHotspot(id, evt) {
  var topic = _findHotspotById(id);
  if (!topic) { showToast(window.currentLang === 'en' ? 'Topic not found, please search again' : '未找到该热点，请重新搜索'); return; }
  _flashClickedButton(evt);
  currentProductContext = null;
  persistWorkspaceSoon();
  // 若还没有 currentArticle，就用热点标题+摘要作为脚本源
  currentArticle = {
    title: topic.title,
    content: (topic.summary || '') + (topic.sourceUrl && topic.sourceUrl !== '#' ? '\n\nSource: ' + topic.sourceUrl : '')
  };
  scrollToSection('video');
  _nextFrameThen(function() { generateScript(); });
}

// ============ PRODUCT INTEL — 第二条内容入口 ============
// currentProductContext: { title, description, brand, bullets[], images[], price, url, source }
var currentProductContext = null;

async function scrapeProduct() {
  var input = document.getElementById('productUrlInput');
  var url = (input.value || '').trim();
  if (!url) { showToast('请输入商品链接 URL'); return; }
  if (!/^https?:\/\//i.test(url)) { showToast('URL 必须以 http:// 或 https:// 开头'); return; }

  var btn = document.getElementById('btnScrapeProduct');
  var loading = document.getElementById('productLoading');
  var card = document.getElementById('productCard');
  var empty = document.getElementById('productEmpty');

  btn.disabled = true;
  var originalHtml = btn.innerHTML;
  btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 抓取中...';
  loading.style.display = 'block';
  card.style.display = 'none';
  if (empty) empty.style.display = 'none';

  try {
    var resp = await fetch('/api/product_scrape?url=' + encodeURIComponent(url));
    var data = await resp.json();
    if (!data || !data.success) {
      throw new Error((data && data.error) || '抓取失败');
    }
    currentProductContext = data.product;
    renderProductCard(currentProductContext);
    showToast('✅ 已抓取商品：' + (currentProductContext.title || '').slice(0, 40));
  } catch (e) {
    console.error('[Product] scrape error', e);
    showToast('⚠️ 商品抓取失败：' + (e && e.message ? e.message : '未知错误'));
    if (empty) empty.style.display = 'block';
  } finally {
    loading.style.display = 'none';
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    document.getElementById('btnClearProduct').style.display = currentProductContext ? '' : 'none';
  }
}

function renderProductCard(p) {
  var card = document.getElementById('productCard');
  var empty = document.getElementById('productEmpty');
  if (empty) empty.style.display = 'none';

  var mainImg = (p.images && p.images[0]) || '';
  var imgsHtml = '';
  if (p.images && p.images.length) {
    imgsHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">';
    for (var i = 0; i < Math.min(p.images.length, 8); i++) {
      imgsHtml += '<img src="' + safeUrl(p.images[i]) + '" referrerpolicy="no-referrer" style="width:88px;height:88px;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:var(--bg-primary);" onerror="this.style.display=\'none\'" />';
    }
    imgsHtml += '</div>';
  }

  var bulletsHtml = '';
  if (p.bullets && p.bullets.length) {
    bulletsHtml = '<ul class="prod-en" style="margin-top:12px;padding-left:20px;color:var(--text-secondary);font-size:13px;line-height:1.7;">';
    for (var j = 0; j < Math.min(p.bullets.length, 8); j++) {
      bulletsHtml += '<li>' + escapeHtml(p.bullets[j]) + '</li>';
    }
    bulletsHtml += '</ul>';
  }

  // 描述与卖点同源时不渲染：当当没有独立商品描述字段，后端是用参数拼的，
  // 照原样显示会让卡片上同一句话连着出现两遍（详见 isDigestDescRedundant）
  var showDesc = p.description && !isDigestDescRedundant(p);
  var descHtml = showDesc ? '<p class="prod-en" style="margin-top:10px;color:var(--text-secondary);font-size:13px;line-height:1.7;">' + escapeHtml(p.description.slice(0, 400)) + (p.description.length > 400 ? '...' : '') + '</p>' : '';
  var priceHtml = p.price ? '<span style="font-size:13px;color:#22c55e;font-weight:600;margin-left:10px;">💰 ' + escapeHtml(p.price) + '</span>' : '';
  var brandHtml = p.brand ? '<span style="font-size:12px;padding:2px 10px;border-radius:6px;background:rgba(99,102,241,0.15);color:var(--accent-light);margin-left:8px;">' + escapeHtml(p.brand) + '</span>' : '';
  var sourceHtml = p.source ? '<span style="font-size:11px;color:var(--text-secondary);">来源：' + escapeHtml(p.source) + '</span>' : '';
  var ratingHtml = p.rating ? '<span style="font-size:12px;color:#fbbf24;margin-left:8px;">⭐ ' + escapeHtml(p.rating) + '</span>' : '';

  var digestText = buildProductDigest(p, { markdown: true });
  var digestHTML = buildProductDigestHTML(p);
  var reviewTitle = '📋 抓取核对区 · 这段文本将作为下一步生成的输入源';
  var reviewHint = '抓取器根据商品页自动填入。核对内容是否正确，把不准的地方改掉、缺的卖点补上，然后点击下方按钮。图文/脚本会用这段核对后的文本，不再读原始抓取。';
  var resetBtnText = '↻ 恢复原始抓取';
  var articleBtnText = '以此商品生成图文';
  var scriptBtnText = '以此商品生成脚本+视频';
  var clearBtnText = '清空商品上下文';
  var viewOriginText = '🔗 查看商品原页';
  var unrecognizedText = '(未识别到标题)';

  card.innerHTML =
    '<div class="card" style="padding:20px;">'
      + '<div style="display:flex;gap:20px;flex-wrap:wrap;">'
        + (mainImg ? '<img src="' + safeUrl(mainImg) + '" referrerpolicy="no-referrer" style="width:180px;height:180px;object-fit:cover;border-radius:10px;border:1px solid var(--border);background:var(--bg-primary);" onerror="this.style.display=\'none\'" />' : '')
        + '<div style="flex:1;min-width:280px;">'
          + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">' + sourceHtml + brandHtml + priceHtml + ratingHtml + '</div>'
          + '<h3 class="prod-en" style="font-size:17px;font-weight:700;line-height:1.45;color:var(--text-primary);">' + escapeHtml(p.title || unrecognizedText) + '</h3>'
          + '<a href="' + (safeUrl(p.url) || '#') + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;font-size:12px;color:var(--accent-light);text-decoration:underline;">' + viewOriginText + '</a>'
          + descHtml
          + bulletsHtml
        + '</div>'
      + '</div>'
      + imgsHtml

      // ============ 核对富文本框 ============
      + '<div style="margin-top:20px;padding-top:18px;border-top:1px dashed var(--border);">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap;">'
          + '<div style="font-size:14px;font-weight:600;color:var(--text-primary);">' + reviewTitle + '</div>'
          + '<button class="btn btn-outline btn-sm" onclick="resetProductDigest()" title="' + escapeAttr(reviewHint) + '">' + resetBtnText + '</button>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">' + reviewHint + '</div>'
        + '<div id="productDigest" class="prod-en" contenteditable="true" spellcheck="false" oninput="onProductDigestEdit()">'
          + digestHTML + '</div>'
        + '<div id="productDigestStatus" style="margin-top:8px;font-size:11px;color:var(--text-secondary);"></div>'
      + '</div>'

      + '<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;">'
        + '<button class="btn btn-primary" onclick="startArticleFromProduct()">'
          + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/></svg>'
          + articleBtnText
        + '</button>'
        + '<button class="btn btn-primary" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);" onclick="startScriptFromProduct()">'
          + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>'
          + scriptBtnText
        + '</button>'
        + '<button class="btn btn-outline" onclick="clearProductContext()">' + clearBtnText + '</button>'
      + '</div>'
    + '</div>';
  card.style.display = 'block';

  // 记录原始 digest（HTML 富文本 + 纯文本快照）以便"恢复原始抓取"
  currentProductContext = p;
  currentProductContext._rawDigestHTML = digestHTML;
  var digestEl = document.getElementById('productDigest');
  currentProductContext._reviewedText = digestEl ? htmlDigestToText(digestEl) : digestText;
}

function onProductDigestEdit() {
  var el = document.getElementById('productDigest');
  if (!el || !currentProductContext) return;
  currentProductContext._reviewedText = htmlDigestToText(el);
  var status = document.getElementById('productDigestStatus');
  if (status) {
    var isEn = (window.currentLang === 'en');
    var changed = (el.innerHTML !== currentProductContext._rawDigestHTML);
    status.textContent = changed
      ? (isEn ? '✏️ Edited — next generation will use YOUR edited version' : '✏️ 已修改 · 下一次生成会使用你改过的版本')
      : (isEn ? '📝 Untouched — using original scrape' : '📝 尚未修改 · 使用原始抓取');
    status.style.color = changed ? '#22c55e' : 'var(--text-secondary)';
  }
}

function resetProductDigest() {
  if (!currentProductContext) return;
  var el = document.getElementById('productDigest');
  if (!el) return;
  el.innerHTML = currentProductContext._rawDigestHTML || '';
  currentProductContext._reviewedText = htmlDigestToText(el);
  onProductDigestEdit();
  showToast(window.currentLang === 'en' ? '↻ Restored to raw scrape' : '↻ 已恢复原始抓取');
}

function clearProductContext() {
  currentProductContext = null;
  document.getElementById('productCard').style.display = 'none';
  document.getElementById('productCard').innerHTML = '';
  document.getElementById('btnClearProduct').style.display = 'none';
  var empty = document.getElementById('productEmpty');
  if (empty) empty.style.display = 'block';
  // ⚠️ 必须立刻落盘：只改内存的话，刷新后 workspace 快照里那份商品上下文会把它复活，
  // 用户会觉得"清了又回来了"（和之前 deleteAsset 那个 bug 同一类）。
  saveAppData();
  showToast(window.currentLang === 'en' ? 'Product context cleared — the next generation will not include product info' : '已清空商品上下文，下一次生成将不带商品信息');
}

// 用户主动清空整个工作区。
// 有了持久化就必须给出口 —— 否则一个卡住的坏状态会永久跟着用户，
// 连刷新都甩不掉（这正是持久化最大的副作用）。
function clearWorkspace() {
  var isEn = (window.currentLang === 'en');
  var msg = isEn
    ? 'Clear the whole workspace?\n\nInput boxes, product context, current article and script drafts will be emptied.\nYour saved assets (articles / images / videos in the Asset Library) are NOT affected.'
    : '确定清空整个工作区？\n\n输入框、商品上下文、当前文章和脚本草稿都会被清空。\n已保存的资产（资产库里的文章 / 图片 / 视频）不受影响。';
  if (!confirm(msg)) return;

  for (var i = 0; i < WORKSPACE_INPUT_IDS.length; i++) {
    var el = document.getElementById(WORKSPACE_INPUT_IDS[i]);
    if (el) el.value = '';
  }
  currentProductContext = null;
  currentArticle = null;
  var card = document.getElementById('productCard');
  if (card) { card.style.display = 'none'; card.innerHTML = ''; }
  var bc = document.getElementById('btnClearProduct'); if (bc) bc.style.display = 'none';
  var pe = document.getElementById('productEmpty'); if (pe) pe.style.display = 'block';
  var sc = document.getElementById('scriptContent'); if (sc) sc.textContent = '';
  var sr = document.getElementById('scriptResult'); if (sr) sr.style.display = 'none';
  var sbv = document.getElementById('vcStoryboardView'); if (sbv) sbv.textContent = '';
  var sba = document.getElementById('vcStoryboardArea'); if (sba) sba.style.display = 'none';
  var ar = document.getElementById('articleResult'); if (ar) ar.style.display = 'none';
  var ap = document.getElementById('articlePreview'); if (ap) ap.innerHTML = '';

  saveAppData();
  showToast(isEn ? '✅ Workspace cleared' : '✅ 工作区已清空');
}

// 读取用户核对后的富文本（若无则回退原始 digest）
function getReviewedProductText() {
  if (!currentProductContext) return '';
  // 优先读富文本核对区当前内容（含图片标注），其次快照，最后回退拼装
  var el = document.getElementById('productDigest');
  if (el) return htmlDigestToText(el);
  return (currentProductContext._reviewedText || buildProductDigest(currentProductContext, { markdown: true }));
}

// 商品 → 图文（复用同一条 generateArticle 链路，用核对后的富文本）
function startArticleFromProduct() {
  if (!currentProductContext) { showToast('请先抓取商品'); return; }
  scrollToSection('article');
  // 富文本第一行通常是 "# Title" 或 "Product: XXX"，作为文章主题
  var reviewed = getReviewedProductText();
  var titleGuess = extractTitleFromDigest(reviewed) || currentProductContext.title || '';
  document.getElementById('articleTopic').value = titleGuess;
  setTimeout(function() { generateArticle(); }, 400);
}

// 商品 → 视频脚本
function startScriptFromProduct() {
  if (!currentProductContext) { showToast('请先抓取商品'); return; }
  var reviewed = getReviewedProductText();
  var titleGuess = extractTitleFromDigest(reviewed) || currentProductContext.title || 'Product Video';
  currentArticle = currentArticle || {
    title: titleGuess,
    content: reviewed
  };
  scrollToSection('video');
  setTimeout(function() { generateScript(); }, 400);
}

function extractTitleFromDigest(text) {
  if (!text) return '';
  var lines = String(text).split(/\r?\n/);
  for (var i = 0; i < lines.length && i < 5; i++) {
    var m = lines[i].match(/^#\s+(.+)$/) || lines[i].match(/^Product:\s*(.+)$/i) || lines[i].match(/^商品[:：]\s*(.+)$/);
    if (m) return m[1].trim();
  }
  // 兜底：第一行非空
  for (var k = 0; k < lines.length; k++) {
    if (lines[k].trim().length > 3) return lines[k].trim();
  }
  return '';
}

// 把商品上下文拼成图文式富文本（作为下游 LLM 的输入源，也作为核对区默认内容）
// opts.markdown=true 时输出更结构化的 Markdown（用于文本框展示）；否则单行紧凑格式
function buildProductDigest(p, opts) {  if (!p) return '';
  opts = opts || {};
  var lines = [];
  if (opts.markdown) {
    // 标题
    lines.push('# ' + (p.title || '（未识别到商品标题）'));
    lines.push('');
    // 元信息
    var meta = [];
    if (p.brand) meta.push('**品牌：**' + p.brand);
    if (p.price) meta.push('**价格：**' + p.price);
    if (p.rating) meta.push('**评分：**' + p.rating);
    if (p.sku) meta.push('**货号：**' + p.sku);
    if (p.source) meta.push('**来源：**' + p.source);
    if (meta.length) { lines.push(meta.join(' · ')); lines.push(''); }
    // 描述：与卖点同源时不重复输出（当当没有独立商品描述，
    // 后端是用参数拼出来的，两段一模一样只会白占 prompt 长度）
    if (p.description && !isDigestDescRedundant(p)) {
      lines.push('## 商品描述');
      lines.push(p.description);
      lines.push('');
    }
    // 卖点
    if (p.bullets && p.bullets.length) {
      lines.push('## 卖点与参数');
      for (var i = 0; i < Math.min(p.bullets.length, 8); i++) {
        lines.push('- ' + p.bullets[i]);
      }
      lines.push('');
    }
    // 图片
    if (p.images && p.images.length) {
      lines.push('## 商品图（' + p.images.length + ' 张）');
      for (var g = 0; g < Math.min(p.images.length, 8); g++) {
        lines.push((g === 0 ? '- 主图 ' : '- ') + p.images[g]);
      }
      lines.push('');
    }
    // 来源
    if (p.url) {
      lines.push('## 商品原链接');
      lines.push(p.url);
    }
    return lines.join('\n');
  }
  // 单行紧凑（旧行为，供其他调用者兼容）
  if (p.title) lines.push('商品：' + p.title);
  if (p.brand) lines.push('品牌：' + p.brand);
  if (p.price) lines.push('价格：' + p.price);
  if (p.rating) lines.push('评分：' + p.rating);
  if (p.description && !isDigestDescRedundant(p)) lines.push('商品描述：' + p.description);
  if (p.bullets && p.bullets.length) {
    lines.push('卖点与参数：');
    for (var b = 0; b < Math.min(p.bullets.length, 8); b++) {
      lines.push('- ' + p.bullets[b]);
    }
  }
  if (p.url) lines.push('商品原链接：' + p.url);
  return lines.join('\n');
}

// description 是否只是 bullets 的另一种拼法。
// 当当商品页没有独立的商品描述字段，后端 _parse_dangdang 是用前 6 条参数
// 拼一条 description 顶上（比让通用兜底去捡 meta description 干净得多，
// 那个 SEO 串里带着当当标错的品牌）。代价是这两段内容重复，
// 卡片上会连着显示两遍一样的话，塞进 prompt 也是白占长度。
function isDigestDescRedundant(p) {
  if (!p || !p.description || !p.bullets || !p.bullets.length) return false;
  var norm = function (s) { return String(s).replace(/[\s·•\-—、,，]/g, ''); };
  var d = norm(p.description);
  if (!d) return false;
  // 用"描述里是否已被卖点覆盖"判断，而不是要求字符串全等 ——
  // 分隔符和截断条数以后可能改，全等判定会静默失效。
  var joined = norm(p.bullets.slice(0, 8).join(''));
  return joined.indexOf(d) >= 0 || d.indexOf(joined) >= 0;
}

// 构建富文本核对区 HTML（图片直接以 <img> 嵌入，可编辑）
// ⚠️ 所有 scraped 第三方内容必须用 safeUrl / escapeAttr 转义，不能只用 escapeHtml。
function buildProductDigestHTML(p) {
  if (!p) return '';
  var esc = escapeHtml;
  var attr = escapeAttr;
  var h = [];
  h.push('<h3>' + esc(p.title || '（未识别到商品标题）') + '</h3>');
  var meta = [];
  if (p.brand) meta.push('品牌：' + esc(p.brand));
  if (p.price) meta.push('价格：' + esc(p.price));
  if (p.rating) meta.push('评分：' + esc(p.rating));
  if (p.sku) meta.push('货号：' + esc(p.sku));
  if (p.source) meta.push('来源：' + esc(p.source));
  if (meta.length) h.push('<div class="prod-meta">' + meta.join(' · ') + '</div>');
  // 图片行（嵌入实际图片，非仅链接）
  if (p.images && p.images.length) {
    h.push('<h4>商品图</h4>');
    h.push('<div class="prod-img-row">');
    for (var i = 0; i < Math.min(p.images.length, 8); i++) {
      h.push('<img src="' + safeUrl(p.images[i]) + '" referrerpolicy="no-referrer" alt="product image ' + (i + 1) + '" onerror="this.style.display=\'none\'" />');
    }
    h.push('</div>');
  }
  if (p.description && !isDigestDescRedundant(p)) {
    h.push('<h4>商品描述</h4>');
    h.push('<p>' + esc(p.description) + '</p>');
  }
  if (p.bullets && p.bullets.length) {
    h.push('<h4>卖点与参数</h4>');
    h.push('<ul>');
    for (var b = 0; b < Math.min(p.bullets.length, 10); b++) {
      h.push('<li>' + esc(p.bullets[b]) + '</li>');
    }
    h.push('</ul>');
  }
  if (p.url) {
    h.push('<h4>商品原链接</h4>');
    var safe = safeUrl(p.url);
    h.push(safe
      ? '<p><a href="' + safe + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent-light);">' + esc(p.url) + '</a></p>'
      : '<p>' + esc(p.url) + '</p>');
  }
  return h.join('\n');
}

// 从富文本核对区读取纯文本（供下游 LLM），并把 <img> 转成 [image: url] 标注
function htmlDigestToText(rootEl) {
  if (!rootEl) return '';
  var clone = rootEl.cloneNode(true);
  // 图片转成文字标注，保留 URL 供 LLM 参考
  var imgs = clone.querySelectorAll('img');
  for (var i = 0; i < imgs.length; i++) {
    var url = imgs[i].getAttribute('src') || '';
    var note = document.createTextNode('\n[image: ' + url + ']\n');
    imgs[i].parentNode.replaceChild(note, imgs[i]);
  }
  // 换行处理：块级元素后补换行
  var text = clone.innerText || clone.textContent || '';
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

// 爆款拆解：分析热点话题为什么能成为爆款
function startBoomAnalysis(id, evt) {
  var topic = _findHotspotById(id);
  if (!topic) { showToast(window.currentLang === 'en' ? 'Topic not found, please search again' : '未找到该热点，请重新搜索'); return; }
  _flashClickedButton(evt);
  currentProductContext = null;  // 切换入口：清掉商品上下文
  persistWorkspaceSoon();
  scrollToSection('article');
  document.getElementById('articleTopic').value = '【爆款拆解】' + topic.title;
  // 标记当前为爆款拆解模式
  window._boomAnalysisTopic = topic;
  _nextFrameThen(function() { generateBoomAnalysis(topic); });
}

async function generateBoomAnalysis(topic) {
  var result = document.getElementById('articleResult');
  var loading = document.getElementById('articleLoading');
  var preview = document.getElementById('articlePreview');
  result.style.display = 'block';
  loading.style.display = 'block';
  preview.innerHTML = '';
  document.getElementById('btnGenerateArticle').disabled = true;
  document.getElementById('btnGenerateArticle').innerHTML = '<div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 爆款拆解中...';

  var topicTitle = topic.title;
  var topicSummary = topic.summary || '';
  var topicCat = topic.cat || '';
  var topicHotness = topic.hotness || 0;

  try {
    var systemPrompt = '你是一位顶级内容爆款分析师，拥有15年病毒内容研究经验。你曾任职于字节跳动内容策略部，深度参与过抖音、视频号、小红书的爆款内容标准制定。你精通：①平台推荐算法的底层逻辑；②用户心理触发机制（情绪共振、认知偏差、社交货币）；③爆款内容的DNA解构。你的分析风格：犀利、有洞见、用数据和案例说话、给出可操作的方法论。你输出的分析能让创作者直接照着做。输出格式：用HTML输出，h2/h3做小标题，p做段落，strong强调关键观点，ul/li做清单。字数2000-3000。';

    var userPrompt = '请对以下热点话题进行深度「爆款拆解」分析：\n\n'
      + '【话题标题】' + topicTitle + '\n'
      + '【话题摘要】' + topicSummary + '\n'
      + '【所属分类】' + topicCat + '\n'
      + '【当前热度】' + topicHotness + '万\n\n'
      + '请从以下5个维度进行深度拆解（每个维度都要有具体分析和可操作建议）：\n'
      + '1. 🔥 爆款基因：这个话题为什么能爆？核心触发点是什么？（从话题本身的社会情绪、时效性、争议性、共鸣度等角度分析）\n'
      + '2. 📊 算法助攻：平台算法为什么愿意推它？它命中了哪些推荐权重？（覆盖：完播率预期、互动率设计、标题/封面的点击诱导、话题标签的流量虹吸）\n'
      + '3. 🧠 心理触发点：它触发了用户哪些心理机制？（覆盖：损失厌恶、社交货币、身份认同、情绪共振、好奇心缺口等）\n'
      + '4. 🏗️ 内容结构拆解：如果已有相关内容，其结构有什么特点？黄金3秒钩子是什么？信息密度如何分配？\n'
      + '5. 🛠️ 可复制的方法论：普通人如何借鉴这个爆款逻辑，创造出自己的爆款？（给出3-5条具体可执行的建议）\n\n'
      + '要求：\n- 不要空泛地讲道理，每个观点都要有具体例子或数据支撑\n- 如果是视频类爆款，要分析画面节奏和BGM选择\n- 如果是图文类爆款，要分析标题党技巧和封面设计\n- 最后给出一个「爆款复制检查清单」（Checklist）\n'
      + '不要输出markdown代码块，直接输出HTML内容。';

    var apiKey = document.getElementById('minimaxKey').value.trim() || 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...';
    var useRealApi = apiKey.indexOf('eyJhbGci') === -1;

    var content = '';
    if (useRealApi) {
      try {
        var response = await fetch(MM_TEXT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify({
            model: 'max-assistant-2.7',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.8,
            max_tokens: 3000
          })
        });
        var data = await response.json();
        if (data.choices && data.choices[0]) {
          content = data.choices[0].message.content;
        } else {
          throw new Error(data.error ? (data.error.message || JSON.stringify(data.error)) : 'Unknown API error');
        }
      } catch(e) {
        console.log('Boom analysis API failed, using local analysis:', e.message);
        content = buildBoomAnalysis(topicTitle, topicSummary, topicCat, topicHotness);
      }
    } else {
      content = buildBoomAnalysis(topicTitle, topicSummary, topicCat, topicHotness);
    }

    // 渲染结果
    var safeContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    // 简单还原HTML标签
    safeContent = safeContent.replace(/&lt;(\/?)(h[1-6]|p|strong|em|u|br|ul|ol|li|div|span|hr)(\s[^&]*)?&gt;/g, '<$1$2$3>');
    safeContent = safeContent.replace(/&lt;br&gt;/g, '<br>');

    preview.innerHTML = ''
      + '<div style="padding:20px;">'
      + '<div style="font-size:20px;font-weight:700;margin-bottom:16px;color:var(--accent-light);">📈 爆款拆解：「' + escapeHtml(topicTitle) + '」</div>'
      + '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;padding:10px;background:var(--bg-tertiary);border-radius:8px;">'
      + '热度：<strong>' + topicHotness + '万</strong>　|　分类：<strong>' + topicCat + '</strong>　|　分析时间：' + new Date().toLocaleString('zh-CN') + ''
      + '</div>'
      + '<div style="font-size:14px;line-height:1.8;">' + (content.indexOf('<') !== -1 ? content : safeContent) + '</div>'
      + '</div>';

    loading.style.display = 'none';

    // 保存
    var analysisArticle = {
      id: 'boom_' + Date.now(),
      title: '【爆款拆解】' + topicTitle,
      platform: '爆款分析',
      content: preview.innerHTML,
      date: new Date().toLocaleString('zh-CN'),
      isBoomAnalysis: true
    };
    generatedArticles.push(analysisArticle);
    updateArticleList();
    flushAssets();   // 生成即入库
    showToast('✅ 爆款拆解完成！');

  } catch(e) {
    console.error('Boom analysis error:', e);
    preview.innerHTML = '<div style="padding:20px;color:var(--text-secondary);">生成失败：' + escapeHtml(String(e.message || e)) + '<br><br>正在使用本地分析引擎...</div>';
    var fallback = buildBoomAnalysis(topicTitle, topicSummary, topicCat, topicHotness);
    preview.innerHTML = ''
      + '<div style="padding:20px;">'
      + '<div style="font-size:20px;font-weight:700;margin-bottom:16px;color:var(--accent-light);">📈 爆款拆解：「' + escapeHtml(topicTitle) + '」</div>'
      + '<div style="font-size:14px;line-height:1.8;">' + fallback + '</div>'
      + '</div>';
    // 兜底引擎也保存到资产
    var fallbackArticle = {
      id: 'boom_' + Date.now(),
      title: '【爆款拆解】' + topicTitle,
      platform: '爆款分析',
      content: fallback,
      date: new Date().toLocaleString('zh-CN'),
      isBoomAnalysis: true
    };
    generatedArticles.push(fallbackArticle);
    flushAssets();   // 生成即入库
    loading.style.display = 'none';
  }

  document.getElementById('btnGenerateArticle').disabled = false;
  document.getElementById('btnGenerateArticle').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg> 生成文章';
  window._boomAnalysisTopic = null;
}

// 本地爆款拆解引擎（API失败时的回退）
function buildBoomAnalysis(title, summary, cat, hotness) {
  var catLabel = { ai: 'AI技术', platform: '平台动态', 'short-video': '短视频', content: '内容创作', trend: '行业趋势', monetize: '变现策略' }[cat] || '热点';
  var hotnessLevel = hotness >= 90 ? '超级爆款（90万+热度）' : hotness >= 75 ? '热门内容（75万+热度）' : '潜力爆款';
  var triggers = [];
  if (title.indexOf('AI') !== -1 || title.indexOf('人工智能') !== -1) triggers.push('AI焦虑+技术红利双重驱动');
  if (title.indexOf('如何') !== -1 || title.indexOf('干货') !== -1) triggers.push('实用价值+信息差');
  if (title.indexOf('揭秘') !== -1 || title.indexOf('真相') !== -1) triggers.push('好奇心缺口+认知冲突');
  if (title.indexOf('收入') !== -1 || title.indexOf('变现') !== -1 || title.indexOf('赚钱') !== -1) triggers.push('利益驱动+损失厌恶');
  if (triggers.length === 0) triggers.push('情绪共振+社会热点');

  return '<h2>🔥 一、爆款基因分析</h2>'
    + '<p>该话题属于<strong>' + catLabel + '</strong>赛道，当前热度<strong>' + hotnessLevel + '</strong>。</p>'
    + '<p>核心爆点：' + triggers.join('、') + '。这类话题天然具备传播DNA——它击中了目标用户的核心痛点或爽点，让用户产生"这与我有关"的强烈感知。</p>'
    + '<h2>📊 二、算法助攻分析</h2>'
    + '<p>从算法视角看，该话题具备以下推荐权重优势：</p>'
    + '<ul>'
    + '<li><strong>点击率诱导</strong>：标题含争议词/数字/疑问句，CTR预估高于均值30%+</li>'
    + '<li><strong>完播率预期</strong>：话题本身具备强连续性，用户会看到最后</li>'
    + '<li><strong>互动率设计</strong>：话题自带立场分歧，评论区天然形成辩论</li>'
    + '<li><strong>标签流量虹吸</strong>：#AI #短视频 #自媒体 等大流量标签加持</li>'
    + '</ul>'
    + '<h2>🧠 三、心理触发点拆解</h2>'
    + '<p>该话题成功触发了以下用户心理机制：</p>'
    + '<ul>'
    + '<li><strong>损失厌恶</strong>："不做就亏了"的紧迫感</li>'
    + '<li><strong>社交货币</strong>：转发后显得自己有见识/有资源</li>'
    + '<li><strong>身份认同</strong>：内容替某类人群说了他们想说的话</li>'
    + '<li><strong>好奇心缺口</strong>：标题留白，必须点进去才知道答案</li>'
    + '</ul>'
    + '<h2>🏗️ 四、内容结构特点</h2>'
    + '<p>基于该话题的内容通常具备以下结构特征：</p>'
    + '<ul>'
    + '<li><strong>黄金3秒钩子</strong>：开头即抛出反常识观点或惊人数据</li>'
    + '<li><strong>信息密度梯度</strong>：每5秒/每200字有一个价值点</li>'
    + '<li><strong>情绪曲线设计</strong>：好奇→惊讶→认同→行动，四段式情绪递进</li>'
    + '<li><strong>结尾CTA</strong>：引导关注/评论/转发，闭环设计</li>'
    + '</ul>'
    + '<h2>🛠️ 五、可复制的方法论</h2>'
    + '<p>普通人如何借鉴这个爆款逻辑？给出以下可执行建议：</p>'
    + '<ul>'
    + '<li><strong>追踪热点但不追热点</strong>：找到热点背后的"不变需求"，用你的垂直领域重新包装</li>'
    + '<li><strong>标题公式</strong>：数字+反常识+利益承诺，如"3个被90%人忽略的XX技巧"</li>'
    + '<li><strong>钩子模板</strong>：开头用"你以为...其实..."结构，制造认知冲突</li>'
    + '<li><strong>互动设计</strong>：在内容中预埋"槽点"，引导评论区讨论</li>'
    + '<li><strong>发布时机</strong>：追踪该爆款的发生时间，在同类时间段发布（通常在晚上8-10点）</li>'
    + '</ul>'
    + '<hr>'
    + '<h2>✅ 爆款复制检查清单</h2>'
    + '<ul>'
    + '<li>□ 标题是否让人产生"这与我有关"的感觉？</li>'
    + '<li>□ 开头3秒是否抛出了反常识观点？</li>'
    + '<li>□ 内容中是否有至少3个可立即使用的干货点？</li>'
    + '<li>□ 是否预埋了引导评论的"槽点"或提问？</li>'
    + '<li>□ 结尾是否有明确的关注/转发引导？</li>'
    + '<li>□ 封面/标题缩略图是否有强对比色+大字？</li>'
    + '</ul>'
    + '<p style="margin-top:20px;padding:12px;background:var(--bg-tertiary);border-radius:8px;font-size:13px;color:var(--text-secondary);">⚡ 以上分析由<strong>爆款拆解引擎</strong>生成，结合平台算法逻辑和心理学原理，助你快速复制爆款逻辑。</p>';
}

function selectPlatform(platform, el) {
  selectedPlatform = platform;
  var chips = document.querySelectorAll('#section-article .platform-chip');
  for (var i = 0; i < chips.length; i++) { chips[i].classList.remove('active'); }
  el.classList.add('active');
}

// 这里原来有个 selectTextModel(model, el)：点 .text-model-chip 切换全局 selectedTextModel。
// 已删除 —— 那些 chip 的 HTML 早先就被模型下拉框（data-model-picker="article"）取代了，
// 函数留着但页面上一个调用方都没有，改的还是个已经作废的全局。

// 更新视频生成区的文章选择下拉框
function updateVideoSourceOptions() {
  var select = document.getElementById('videoSource');
  if (!select) return;
  // 保留第一项"从已生成的文章中选择..."
  select.innerHTML = '<option value="">从已生成的文章中选择...</option>';
  for (var i = 0; i < generatedArticles.length; i++) {
    var a = generatedArticles[i];
    var option = document.createElement('option');
    option.value = String(i);
    option.textContent = a.title + '  [' + a.platform + ']';
    select.appendChild(option);
  }
}

// ============ Phase 2.1: 分步生成 —— Step ① 只生成纯文本 ============
async function generateArticleText() {
  var topic = document.getElementById('articleTopic').value.trim();
  if (!topic) { showToast('请输入文章主题'); return; }

  var result = document.getElementById('articleResult');
  var loading = document.getElementById('articleLoading');
  var preview = document.getElementById('articlePreview');
  result.style.display = 'block';
  loading.style.display = 'block';
  preview.innerHTML = '';

  var btn = document.getElementById('btnGenerateArticleText');
  btn.disabled = true;
  var modelName = modelNameById(getPickedModelId('article')) || '大模型';
  btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:currentColor;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> ' + modelName + ' 生成中...';
  document.getElementById('btnGenerateArticle').disabled = true;

  var platformLabel = platformNames[selectedPlatform] || '小红书';

  try {
    // 平台人设 prompt + 中文输出硬约束（放最后，覆盖人设里可能的语言要求）
    var systemPrompt = pickArticleSystemPrompt(selectedPlatform)
      + '\n\n【硬性要求】全文必须用简体中文写，语感要像该平台的真人创作者，不要翻译腔、不要英文段落（专有名词与品牌名可保留原文）。落地场景全部用国内语境（双十一、618、直播间、种草、私域、拼团、开箱、达人探店等），不要出现 Amazon / Costco / Super Bowl 这类海外文化符号。每段控制在 2-4 句，段与段之间空一行。不要自己写 style 属性或 color 颜色值 —— 上色一律用下面的标记。'
      + richFormatRules();

    var productBlock = '';
    if (currentProductContext) {
      productBlock = '\n\n=== 商品情报（素材，已由用户核对过）===\n' + getReviewedProductText() + '\n=======================================\n把卖点自然织进正文，结尾给一句不硬的引导（比如「链接放在评论区」）。';
    }

    // 关键差异：明确要求 AI 只输出文字，禁止任何图片相关标签
    var userPrompt = '为「' + platformLabel + '」写一篇平台原生的图文，主题是：「' + topic + '」。\n\n' +
      '硬性要求：\n' +
      '1. 只输出 HTML，标签限于 <h2>/<h3>/<p>/<strong>/<em>/<ul>/<li> —— 不要 <img>、不要图片 markdown、不要 figure/picture 标签。\n' +
      '2. 不要 markdown 代码围栏。\n' +
      '3. 直接从正文开始 —— 不要再打印一遍大标题。\n' +
      '4. 篇幅紧凑，语气贴该平台的真人调性。\n' +
      '5. 全文简体中文输出。' + productBlock;

    var articleText = await callModuleText('article', systemPrompt, userPrompt);

    // 兜底清洗：去掉可能残留的图片相关标记
    articleText = String(articleText || '')
      .replace(/```(?:html)?\n?/gi, '')
      .replace(/```\n?/g, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<figure[\s\S]*?<\/figure>/gi, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .trim();

    // 图文生成只要软文：模型若自己追加了短视频脚本段，在这里切掉
    articleText = stripVideoScriptSection(articleText);

    // 若返回没有 HTML 标签，做轻量转换
    if (!/<[hHpPuUoO]/.test(articleText)) {
      articleText = articleText
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n\n/g, '</p><p>');
      articleText = '<p>' + articleText + '</p>';
    }

    // 颜色标记 → 内联样式。必须放在上面那段 markdown 兜底之后：先转的话
    // \*\*(.+?)\*\* 会伸手进 <span style> 里，把样式串当正文改写。
    articleText = richMarkupToHtml(articleText);

    // 和 11009 那份保持一致（原来这两份内容不同，一份还留着海外键）
    var titlePrefixes = { wechat: '深度解析｜', douyin: '重磅！', kuaishou: '老铁们注意了！', xiaohongshu: '✨建议收藏｜', toutiao: '', zhihu: '', weibo: '', bilibili: '', shipinhao: '' };
    var articleTitle = (titlePrefixes[selectedPlatform] || '') + topic;

    loading.style.display = 'none';
    preview.innerHTML =
      '<div class="card" style="padding:24px;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">'
          + '<h3 style="font-size:20px;font-weight:700;line-height:1.4;flex:1;min-width:240px;">' + escapeHtml(articleTitle) + '</h3>'
          + '<span style="font-size:11px;padding:3px 10px;border-radius:6px;background:rgba(234,179,8,0.15);color:#eab308;font-weight:600;white-space:nowrap;">📝 草稿 · 无图</span>'
        + '</div>'
        + '<div class="article-body" id="articleTextBody" contenteditable="true" style="min-height:200px;line-height:1.85;font-size:15px;color:var(--text-primary);outline:none;border:1px dashed transparent;padding:12px;border-radius:10px;transition:border-color .2s;" onfocus="this.style.borderColor=\'var(--accent)\'" onblur="this.style.borderColor=\'transparent\'">' + articleText + '</div>'
        + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">'
          + '<button class="btn btn-primary" onclick="insertArticleImages()" id="btnInsertArticleImages">'
            + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>'
            + '② 一键配图（3 张）'
          + '</button>'
          + '<button class="btn btn-outline" onclick="generateArticleText()">🔄 重新生成文本</button>'
          + '<button class="btn btn-outline" onclick="openFullArticleEditor()">✏️ 打开全屏编辑器</button>'
          + '<button class="btn btn-outline" onclick="publishArticle()">🚀 跳转平台后台发布</button>'
        + '</div>'
        + '<div style="margin-top:10px;font-size:12px;color:var(--text-secondary);">✅ Phase 2.1 分步生成 · 文字已就绪，可直接在框内修改；确认后点击 <strong>② 一键配图</strong> 自动分析文段插入 3 张匹配图。</div>'
      + '</div>';

    // 记录当前草稿以便后续插图 / 保存到资产
    currentArticle = { title: articleTitle, content: articleText, imagesInserted: false };

    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg> ① 生成纯文本';
    document.getElementById('btnGenerateArticle').disabled = false;
    showToast('✅ 纯文本已生成，请审核修改后点击「② 一键配图」');
  } catch (e) {
    console.error('[Article] text-only gen error:', e);
    loading.style.display = 'none';
    btn.disabled = false;
    btn.innerHTML = '① 生成纯文本';
    document.getElementById('btnGenerateArticle').disabled = false;
    showToast('⚠️ 文本生成失败：' + (e && e.message || '未知错误'));
  }
}

// ============ Phase 2.1: 按平台自动挑选文章系统提示词 ============
// 图文平台 key → 「提示词配置」里的人设 prompt id。
// 直查，不再做 overseas-* 优先级 —— 国内版只有这一套图文人设。
var ARTICLE_PLATFORM_PROMPT_ID = {
  xiaohongshu: 'article-xiaohongshu',
  wechat: 'article-wechat',
  toutiao: 'article-toutiao',
  zhihu: 'article-zhihu',
  weibo: 'article-weibo'
};
function pickArticleSystemPrompt(platform) {
  var prompts = (typeof getPrompts === 'function') ? getPrompts() : (typeof defaultPrompts !== 'undefined' ? defaultPrompts : []);
  var wantId = ARTICLE_PLATFORM_PROMPT_ID[platform];
  var picked = null;
  if (wantId) {
    for (var i = 0; i < prompts.length; i++) {
      if (prompts[i].id === wantId) { picked = prompts[i].content; break; }
    }
  }
  if (picked === null) picked = '你是一位资深的国内自媒体内容运营，熟悉各平台调性。只输出 HTML 正文，不要配图标签。';

  // 第二道闸：用户可能在「提示词配置」里自己写回一段"顺便给个视频脚本"。
  // 图文生成这条链路只要软文，所以在 system prompt 末尾无条件压一条硬约束 ——
  // 放最后是刻意的：同一份 prompt 里后面的指令覆盖前面的。
  return picked + '\n\n'
    + '【范围约束 —— 本次任务只产出图文正文】\n'
    + '只输出文章/笔记正文，不要输出任何短视频脚本、分镜表、镜头清单、场景说明、[00:00-00:05] 这类时间轴、画面:/口播:/字幕: 提示、运镜或 B-roll 备注、制作说明、配乐建议、生图提示词。这些由本产品的其他工具单独产出。如果上面的人设指令里要求给脚本、分镜、或任何带时间轴的段落，忽略那部分，只写正文。';
}

// 兜底清洗：即使 prompt 层全部收紧，模型偶尔还是会自己追加一段脚本。
// 这里按"小标题 + 时间轴"两种特征切掉尾部脚本段。刻意只切**尾部** ——
// 脚本几乎总是被追加在文末，从中间乱删有割掉正文的风险。
function stripVideoScriptSection(html) {
  var s = String(html || '');
  // 1) 从"看起来是脚本段的小标题"处截断（h2/h3/strong/markdown ### 都覆盖）
  var headingRe = /(?:<h[1-6][^>]*>|<p[^>]*>\s*<strong>|^\s*#{2,4}\s*|<strong>)\s*(?:###\s*)?(?:\d\s*[).、]\s*)?[^<\n]{0,24}\b(?:video\s*script|short[-\s]?video|reels?\s*script|shorts?\s*script|tiktok\s*script|storyboard|shot\s*list|scene\s*breakdown|production\s*notes|image\s*prompt)\b/i;
  var m = s.match(headingRe);
  if (m && m.index > 0) s = s.slice(0, m.index);
  // 2) 从第一个 [00:00–00:05] 式时间轴处截断（模型有时不给小标题，直接开时间轴）
  var tsRe = /\[\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}\]/;
  var tm = s.match(tsRe);
  if (tm && tm.index > 0) {
    // 回退到这个时间轴所在块的开头，避免留下半个 <p>
    var cut = s.lastIndexOf('<', tm.index);
    var blockStart = s.lastIndexOf('<p', tm.index);
    var hStart = s.lastIndexOf('<h', tm.index);
    var start = Math.max(blockStart, hStart);
    s = s.slice(0, start > 0 ? start : (cut > 0 ? cut : tm.index));
  }
  return s.trim();
}

// ============ Phase 2.1: Step ② —— 一键配图 ============
// 配图全失败时的常驻提示条（插在文章正文上方）。
// 为什么不用 showToast：toast 几秒就消失，而"这篇文章为什么没有图"是个需要
// 一直看得见的状态。附一个「重试配图」按钮，用户不必去猜该点哪里。
function clearImageFailBanner(bodyEl) {
  var host = bodyEl && bodyEl.parentNode;
  if (!host) return;
  var old = host.querySelector('[data-img-fail-banner]');
  if (old && old.parentNode) old.parentNode.removeChild(old);
}
function showImageFailBanner(bodyEl) {
  var host = bodyEl && bodyEl.parentNode;
  if (!host) { showToast('⚠️ 配图生成失败'); return; }
  clearImageFailBanner(bodyEl);
  var bar = document.createElement('div');
  bar.setAttribute('data-img-fail-banner', '1');
  bar.style.cssText = 'margin:0 0 14px;padding:12px 14px;border:1px solid rgba(234,179,8,0.45);'
    + 'border-radius:10px;background:rgba(234,179,8,0.12);color:var(--text-primary);'
    + 'font-size:13px;line-height:1.7;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;';
  var msg = document.createElement('div');
  msg.style.cssText = 'flex:1;min-width:220px;';
  // textContent 而非 innerHTML：这段文案含模型名，将来若拼进错误详情不至于成为注入点
  msg.textContent = '⚠️ 图片模型当前均不可用（额度耗尽或服务端点异常），本文暂无配图。'
    + '可到「大模型配置」检查图片模型状态，或稍后重试。';
  var retry = document.createElement('button');
  retry.className = 'btn btn-outline';
  retry.style.cssText = 'padding:6px 12px;font-size:12px;white-space:nowrap;';
  retry.textContent = '🔁 重试配图';
  retry.onclick = function() { insertArticleImages(); };
  bar.appendChild(msg);
  bar.appendChild(retry);
  host.insertBefore(bar, bodyEl);
}

async function insertArticleImages() {
  var body = document.getElementById('articleTextBody');
  if (!body) { showToast('请先生成纯文本'); return; }
  if (currentArticle && currentArticle.imagesInserted) {
    if (!confirm('已经插入过配图，再次执行会追加更多图片。继续吗？')) return;
  }

  var btn = document.getElementById('btnInsertArticleImages');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 分析文章 + 生成配图...'; }

  try {
    // 1) 读取当前(可能已编辑的)HTML
    var currentHtml = body.innerHTML;
    var plain = currentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    var topic = document.getElementById('articleTopic').value.trim() || (currentArticle && currentArticle.title) || 'article';
    var platformLabel = platformNames[selectedPlatform] || '自媒体';

    // 2) 让模型读完文章产出 3 条画面描述（封面 / 场景 / 概念）
    //    原来这里 prompt 2 直接把文章前 400 字原文塞给图片模型 —— 散文不是画面描述，
    //    模型只能瞎猜。统一走 buildImageBriefs。
    var imgPrompts = await buildImageBriefs(topic, plain, platformLabel);
    console.log('🎯 配图视觉简报:', imgPrompts);

    // 3) 优先商品图，AI 补齐
    var imageUrls = [];
    if (currentProductContext && currentProductContext.images && currentProductContext.images.length) {
      for (var pImg = 0; pImg < currentProductContext.images.length && imageUrls.length < 3; pImg++) {
        imageUrls.push(currentProductContext.images[pImg]);
      }
    }
    for (var pi = 0; pi < imgPrompts.length && imageUrls.length < 3; pi++) {
      try {
        // callModuleImage 而非硬编码 callAgnesImage：尊重用户选的图片模型 + 自动降级
        var one = await callModuleImage('image', imgPrompts[pi], 1);
        if (one && one.length) imageUrls.push(one[0]);
      } catch (imgErr) {
        console.warn('[Article] 第 ' + (pi + 1) + ' 张配图失败，继续:', imgErr);
      }
    }
    // 生成不出来就少插几张 —— 不用 picsum 随机图冒充 AI 配图（用户反馈"配图不应景"）
    // 全失败时给**常驻**提示条而不是 toast：用户点的是"一键配图"，
    // 结果拿到一篇无图文章 + 一个 3 秒就消失的提示，等于什么都没说。
    if (!imageUrls.length) {
      showImageFailBanner(body);
      return;
    }
    // 上一次失败留下的提示条：这次成功了就撤掉，否则会和新插入的图并排显示
    clearImageFailBanner(body);

    // 4) 找到 <p> 段落节点，均匀分配图片插入
    var container = document.createElement('div');
    container.innerHTML = currentHtml;
    var paras = Array.prototype.slice.call(container.querySelectorAll('p'));
    var insertPositions = [];
    if (paras.length >= 6) {
      insertPositions = [Math.floor(paras.length / 4), Math.floor(paras.length / 2), Math.floor(paras.length * 3 / 4)];
    } else if (paras.length >= 3) {
      insertPositions = [1, Math.min(paras.length - 1, 2), paras.length - 1];
    } else {
      // 段落太少：直接把图追加到末尾
      insertPositions = [null, null, null];
    }

    // 按**实际拿到的图片数**循环，不再硬写 3 ——
    // 现在不做随机图兜底，imageUrls 可能只有 1~2 张，写死 3 会插出空 <img>。
    for (var k = 0; k < imageUrls.length; k++) {
      var fig = document.createElement('figure');
      fig.style.cssText = 'margin:18px 0;text-align:center;';
      fig.innerHTML = '<img src="' + safeUrl(imageUrls[k]) + '" referrerpolicy="no-referrer" onerror="' + escapeAttr(IMG_FALLBACK_ONERROR) + '" style="max-width:100%;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,0.25);" />'
        + '<figcaption style="font-size:12px;color:var(--text-secondary);margin-top:6px;">Fig ' + (k + 1) + '</figcaption>';
      var target = (insertPositions[k] !== null && paras[insertPositions[k]]) ? paras[insertPositions[k]] : null;
      if (target && target.parentNode) {
        target.parentNode.insertBefore(fig, target.nextSibling);
      } else {
        container.appendChild(fig);
      }
    }

    body.innerHTML = container.innerHTML;
    if (currentArticle) {
      currentArticle.content = body.innerHTML;
      currentArticle.imagesInserted = true;
      currentArticle.images = imageUrls;
    }
    // 配图落进 currentArticle 后立刻持久化，别等 30 秒定时器
    flushAssets();

    // 更新草稿状态徽章
    var badge = body.parentNode.querySelector('span[style*="草稿"]');
    if (badge) {
      badge.textContent = '✅ 已配图 · ' + imageUrls.length + ' 张';
      badge.style.background = 'rgba(34,197,94,0.18)';
      badge.style.color = '#22c55e';
    }

    showToast('✅ 已插入 ' + imageUrls.length + ' 张配图' + (currentProductContext ? '（含商品原图）' : ''));
  } catch (e) {
    console.error('[Article] insertImages error:', e);
    showToast('⚠️ 配图失败：' + (e && e.message || '未知错误'));
  } finally {
    // 必须放 finally：上面有 early return（配图全失败时），
    // 恢复逻辑写在 try 里的话按钮会永远卡在"生成中"。
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = (currentArticle && currentArticle.imagesInserted) ? '🔁 重新配图' : '② 一键配图（3 张）';
    }
  }
}

// 打开原有全屏编辑器：把当前草稿注入并弹窗
function openFullArticleEditor() {
  var body = document.getElementById('articleTextBody');
  if (!body || !currentArticle) { showToast('请先生成草稿'); return; }
  currentArticle.content = body.innerHTML;
  if (typeof openArticleEditor === 'function') {
    openArticleEditor();
  } else {
    // 兼容：直接用 modal
    document.getElementById('editorContent').innerHTML = currentArticle.content;
    document.getElementById('articleEditModal').style.display = 'flex';
  }
}

async function generateArticle() {
  var topic = document.getElementById('articleTopic').value.trim();
  if (!topic) { showToast('Please enter an article topic'); return; }

  var result = document.getElementById('articleResult');
  var loading = document.getElementById('articleLoading');
  var preview = document.getElementById('articlePreview');
  result.style.display = 'block';
  loading.style.display = 'block';
  preview.innerHTML = '';
  document.getElementById('btnGenerateArticle').disabled = true;
  // 原先这里写死 'Volcano Ark'（海外版遗留的英文名），现在取下拉框里真正在用的那个模型名
  var modelName = modelNameById(getPickedModelId('article')) || '大模型';
  document.getElementById('btnGenerateArticle').innerHTML = '<div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> ' + modelName + ' 生成中...';

  var platformLabel = platformNames[selectedPlatform] || '小红书';

  try {
    // 1. System Prompt：直接走 pickArticleSystemPrompt 拿平台人设，再叠加"中文输出"硬约束
    var systemPrompt = pickArticleSystemPrompt(selectedPlatform)
      + '\n\n【硬性要求】全文必须用简体中文写，语感要像该平台的真人创作者，不要翻译腔、不要英文段落（专有名词与品牌名可保留原文）。落地场景全部用国内语境（双十一、618、直播间、种草、私域、拼团、开箱、达人探店等）。每段控制在 2-4 句，段与段之间空一行。只输出 HTML 正文，标签限于 <h2>/<h3>/<p>/<strong>/<em>/<ul>/<li>；不要 <img>、不要图片 markdown、不要 markdown 代码围栏。不要自己写 style 属性或 color 颜色值 —— 上色一律用下面的标记。'
      + richFormatRules();

    // 若来自「商品情报抓取」入口，则把商品信息作为额外上下文注入 User Prompt
    var productBlock = '';
    if (currentProductContext) {
      productBlock = '\n\n=== 商品情报（素材，已由用户核对过）===\n' + getReviewedProductText() + '\n===========================================================\n把卖点自然织进正文，语气保持平台原生，结尾用一句软引导把人带到商品页/直播间。';
    }

    // 若来自「热点发现」入口，把热点摘要也注入 —— 标题常常只有几个词，
    // 摘要里才有具体的产品/人物/事件，文章和配图都需要这些具体信息。
    // 只在 topic 没被用户改过时采用，避免用户手输别的主题时串上无关热点。
    var hotspotBlock = '';
    var hc = window._hotspotContext;
    if (hc && hc.title === topic && hc.summary) {
      hotspotBlock = '\n\n=== 热点上下文（素材）===\n' + hc.summary
        + (hc.sourceUrl ? '\n来源：' + hc.sourceUrl : '')
        + '\n==========================================\n正文要落在这些具体事实上 —— 点明涉及的真实商品、人物、品牌和地点，不要写空泛的行业感想。';
    }

    var userPrompt = '为「' + platformLabel + '」写一篇平台原生的图文，主题是：「' + topic + '」\n\n'
      + '要求：\n'
      + '1. 开头要有钩子 —— 让人愿意点进来看完。\n'
      + '2. 紧贴主题，至少给出 3 层具体的分析或干货，不要凑字数。\n'
      + '3. 结尾给一个可执行的结论，或一句引导互动的话。\n'
      + '4. 不要打印大标题（标题我单独加）—— 直接从正文开始。\n'
      + '5. 输出裸 HTML（不要 markdown 围栏）。全文简体中文。'
      + productBlock
      + hotspotBlock;

    // 2. 生成文章文本（若输入 topic 是中文，会由英文 system prompt 强制引导输出英文；模型会将中文主题理解为语义再用英文写）
    var articleText = await callModuleText('article', systemPrompt, userPrompt);
    // 图文生成只要软文：切掉模型自行追加的短视频脚本段。
    // 必须放在 plainText 之前 —— 否则脚本正文会一起喂进配图简报，
    // 让配图去画"时间轴/分镜"这种根本不该出现在软文里的画面。
    articleText = stripVideoScriptSection(articleText);
    // 3. 第二步：把文章交给模型转成"视觉简报"，再拿去生成配图
    // 颜色标记必须在这里剥掉：它是排版指令，不是文章内容。留着的话
    // 配图简报会读到一堆 [key][/num]，图片模型收到的等于噪音。
    var plainText = articleText.replace(/\[\/?(?:key|num|good|warn|hl|tip|quote)\]/g, '')
      .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

    // ⚠️ 这里原来有一套 extractKeywords()：用**中文停用词表**去过滤一篇被
    // 强制生成为**英文**的文章。结果"文章核心关键词"提取出来的全是 the / and /
    // you / your / to / of 这类英文虚词，再拼进图片 prompt —— 图片模型收到的
    // 等于一堆噪音，这就是"配图和文章主题完全无关"的根因。
    // 现在改成让 LLM 读完文章直接产出画面描述（见 buildImageBriefs）。
    // 热点摘要一并喂进去：那里有具体的品牌/产品名，正是画面需要的主体。
    var briefSource = (hotspotBlock ? (hc.summary + ' ') : '') + plainText;
    var imgPrompts = await buildImageBriefs(topic, briefSource, platformLabel);
    console.log('🎯 配图视觉简报:', imgPrompts);

    // 4. 生成3张配图（按顺序，每张都有不同侧重）
    var imageUrls = [];
    // 商品入口：优先使用抓取到的商品原图（前 3 张），Agnes 只补差额，避免电商图跑偏
    if (currentProductContext && currentProductContext.images && currentProductContext.images.length) {
      for (var pImg = 0; pImg < currentProductContext.images.length && imageUrls.length < 3; pImg++) {
        imageUrls.push(currentProductContext.images[pImg]);
      }
    }
    // ⚠️ try 必须放在循环**内**：原来包住整个 for，第 1 张失败就直接跳出、
    // 放弃剩下 2 张，然后被下面的 picsum 随机图填满 —— 这是"配图与文章无关"
    // 最直接的一条路径（字面意义的随机图库照片）。
    for (var pi = 0; pi < imgPrompts.length && imageUrls.length < 3; pi++) {
      try {
        // 改用 callModuleImage：尊重用户在下拉框里选的图片模型，且自带跨模型降级；
        // 原来硬编码 callAgnesImage，用户换模型没有任何作用。
        var oneImg = await callModuleImage('image', imgPrompts[pi], 1);
        if (oneImg && oneImg.length > 0) {
          imageUrls.push(oneImg[0]);
        }
      } catch (imgErr) {
        console.warn('第 ' + (pi + 1) + ' 张配图生成失败，继续下一张:', imgErr);
      }
    }

    // 配图数量不足时**不再**塞 picsum 随机图。
    // 拿一张随机风景照配一篇讲猫砂盆的文章，正是用户报的"配图不应景"。
    // 少放几张图是可接受的，假装有 AI 配图不可接受。
    var realImageCount = imageUrls.length;
    if (realImageCount < 3) {
      console.warn('仅生成 ' + realImageCount + ' 张配图（不足 3 张，不做随机图兜底）');
    }

    // 4. 构建标题
    var titlePrefixes = { wechat: '深度解析｜', douyin: '重磅！', kuaishou: '老铁们注意了！', xiaohongshu: '✨建议收藏｜', toutiao: '', zhihu: '', weibo: '', bilibili: '', shipinhao: '' };
    var articleTitle = (titlePrefixes[selectedPlatform] || '') + topic;

    // 5. 构建完整图文内容（含图片，供编辑器和主页统一使用）
    loading.style.display = 'none';

    // 将 AI 返回的文本做轻量 Markdown→HTML 转换（兜底：有些模型会返回 markdown 而非 HTML）
    var hasHtmlTags = /<[hHpPdDiI]/.test(articleText);
    var bodyHtml = articleText;
    if (!hasHtmlTags) {
      bodyHtml = bodyHtml
        .replace(/```html\n?/gi, '')
        .replace(/```\n?/g, '')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .trim();
    } else {
      // 已经是 HTML，仅去除可能的代码块包裹
      bodyHtml = bodyHtml
        .replace(/```html\n?/gi, '')
        .replace(/```\n?/g, '')
        .trim();
    }

    // 如果已经是 HTML（含有标签），不做 p 包裹；否则包裹段落
    if (!/<[hHpP]/.test(bodyHtml)) {
      bodyHtml = '<p>' + bodyHtml + '</p>';
    }

    // 颜色标记 → 内联样式。放在所有 HTML 处理之后：前面那些正则会按 markdown
    // 规则改写文本，先转成 <span style> 的话 style 里的 * 和 _ 有被误伤的风险。
    bodyHtml = richMarkupToHtml(bodyHtml);

    // 构建含嵌入图片的完整内容（供 currentArticle.content 和编辑器使用）
    // 图片地址一律过 safeUrl —— 商品入口的图来自抓取的第三方页面，不能直接信任
    // onerror 一律带上：这三处原来是全站唯一没有失败处理的 <img>，所以只有这里会
    // 露出浏览器默认破图标（用户报的"图标只是个图标，被破坏了"就是它）。
    var _imgErr = escapeAttr(IMG_FALLBACK_ONERROR);
    var fullContent = '';
    if (imageUrls[0]) {
      fullContent += '<img src="' + safeUrl(imageUrls[0]) + '" alt="封面图" referrerpolicy="no-referrer" onerror="' + _imgErr + '" style="max-width:100%;border-radius:8px;margin-bottom:20px;display:block;">';
    }
    fullContent += '<h1 style="font-size:26px;font-weight:800;color:var(--text-primary);margin-bottom:20px;line-height:1.4;">' + escapeHtml(articleTitle) + '</h1>';
    fullContent += bodyHtml;
    if (imageUrls[1]) {
      fullContent += '<img src="' + safeUrl(imageUrls[1]) + '" alt="配图1" referrerpolicy="no-referrer" onerror="' + _imgErr + '" style="max-width:100%;border-radius:8px;margin:16px 0;display:block;">';
    }
    if (imageUrls[2]) {
      fullContent += '<img src="' + safeUrl(imageUrls[2]) + '" alt="配图2" referrerpolicy="no-referrer" onerror="' + _imgErr + '" style="max-width:100%;border-radius:8px;margin:16px 0;display:block;">';
    }

    var article = { title: articleTitle, content: fullContent, img1: imageUrls[0], img2: imageUrls[1], img3: imageUrls[2] };
    currentArticle = article;
    generatedArticles.push({ title: article.title, platform: platformLabel, date: new Date().toLocaleString(), content: fullContent });
    updateStats();
    updateVideoSourceOptions();
    // 生成即入库：不能只靠 30 秒定时器，生成完立刻刷新/关页面就丢了（用户反馈"文章没保存"）
    flushAssets();

    // 封面图可能一张都没生成出来（不再用随机图兜底），这时别渲染成 url('undefined')
    var heroStyle = imageUrls[0]
      ? 'background-image:url(\'' + safeUrl(imageUrls[0]) + '\');'
      : 'background:linear-gradient(135deg,var(--accent),var(--accent-light));';
    // 一张图都没有时给条常驻说明 + 重试入口。
    // 原来只有一个转瞬即逝的 toast，用户看到的就是"一篇无图文章"外加莫名其妙 ——
    // 这正是用户报的"图片为什么出不来"里最难受的一半：不知道发生了什么。
    var failBanner = imageUrls.length ? '' :
      '<div style="margin-top:16px;padding:12px 14px;border:1px solid rgba(234,179,8,0.45);'
      + 'border-radius:10px;background:rgba(234,179,8,0.12);font-size:13px;line-height:1.7;'
      + 'display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;">'
      + '<span style="flex:1;min-width:220px;">⚠️ 图片模型当前均不可用（额度耗尽或服务端点异常），本文暂无配图。'
      + '可到「大模型配置」检查图片模型状态，或点右侧按钮重试。</span>'
      + '<button class="btn btn-outline" style="padding:6px 12px;font-size:12px;white-space:nowrap;" '
      + 'onclick="retryArticleImages(this)">🔁 重试配图</button>'
      + '</div>';

    preview.innerHTML = '<div class="animate-slide-up">'
      + '<div class="article-img" style="' + heroStyle + '">'
      + '<div style="position:relative;z-index:1;">'
      + '<span style="font-size:11px;background:rgba(255,255,255,0.15);padding:4px 10px;border-radius:6px;color:white;">面向：' + platformLabel + ' | 🤖 ' + escapeHtml(modelName) + ' 生成</span>'
      + '<h2 style="font-size:24px;font-weight:700;color:white;margin-top:12px;text-shadow:0 2px 8px rgba(0,0,0,0.5);">' + escapeHtml(articleTitle) + '</h2>'
      + '</div></div>'
      + failBanner
      + '<div class="card" style="margin-top:16px;">'
      + '<div class="article-body" style="font-size:15px;">' + fullContent + '</div>'
      + '<p style="color:var(--accent-light);margin-top:16px;font-size:13px;text-align:right;">—— 本文由 ' + escapeHtml(modelName) + ' 大模型生成 | 面向 ' + platformLabel + ' 平台优化</p>'
      + '</div>'
      + '<div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;">'
      + '<button class="btn btn-primary btn-lg" onclick="openEditor()" style="justify-content:center;">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
      + '打开编辑器</button>'
      + '<button class="btn btn-outline btn-lg" onclick="scrollToSection(\'video\')" style="justify-content:center;">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg>'
      + '生成短视频</button></div></div>';

    document.getElementById('btnGenerateArticle').disabled = false;
    document.getElementById('btnGenerateArticle').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13 12H3"/></svg> AI生成文章';
    // 这里原来又 var modelName 了一次（值还写死成"火山方舟 / MiniMax M2.7"），
    // 把函数开头那个遮住 —— 于是成功提示报的模型可能和文末署名不是同一个。已删，复用外层的。
    // 只报**真实生成成功**的张数。原来这里不管兜底的 picsum 随机图都算进"AI配图"，
    // 用户看到"含3张AI配图"却发现图和文章无关，正是被这句话误导的。
    var imgNote = realImageCount > 0
      ? '（含' + realImageCount + '张AI配图）'
      : '（配图生成失败，仅文本）';
    showToast('✅ ' + modelName + ' 已生成专业文章' + imgNote);

    setTimeout(function() {
      result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);

  } catch (e) {
    // API 失败，回退到本地模板
    console.error('API error:', e);
    loading.style.display = 'none';
    // 把这次真实拿到的图（商品原图 / 已成功生成的 AI 图）传给模板；
    // 一张都没有就不插图，绝不用随机图冒充
    var fallbackImgs = (typeof imageUrls !== 'undefined' && Array.isArray(imageUrls)) ? imageUrls : [];
    var article = buildArticleContent(topic, platformLabel, selectedPlatform, fallbackImgs);
    // 在正文最前面加上标题，确保编辑器和正文页都有标题
    article.content = '<h1 style="font-size:26px;font-weight:800;color:var(--text-primary);margin-bottom:20px;line-height:1.4;">' + escapeHtml(article.title) + '</h1>' + article.content;
    currentArticle = article;
    generatedArticles.push({ title: article.title, platform: platformLabel, date: new Date().toLocaleString(), content: article.content });
    updateStats();
    updateVideoSourceOptions();
    flushAssets();   // 兜底路径同样立刻入库

    var fbHero = article.img1
      ? 'background-image:url(\'' + safeUrl(article.img1) + '\');'
      : 'background:linear-gradient(135deg,var(--accent),var(--accent-light));';
    preview.innerHTML = '<div class="animate-slide-up">'
      + '<div class="article-img" style="' + fbHero + '">'
      + '<div style="position:relative;z-index:1;">'
      + '<span style="font-size:11px;background:rgba(255,255,255,0.15);padding:4px 10px;border-radius:6px;color:white;">面向：' + platformLabel + ' | ⚠️ 本地模板生成</span>'
      + '<h2 style="font-size:24px;font-weight:700;color:white;margin-top:12px;text-shadow:0 2px 8px rgba(0,0,0,0.5);">' + escapeHtml(article.title) + '</h2>'
      + '</div></div>'
      + '<div class="card" style="margin-top:16px;">'
      + '<div class="article-body" style="font-size:15px;">' + article.content + '</div></div>'
      + '<div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;">'
      + '<button class="btn btn-primary btn-lg" onclick="openEditor()">打开编辑器</button>'
      + '<button class="btn btn-outline btn-lg" onclick="scrollToSection(\'video\')">生成短视频</button></div></div>';

    document.getElementById('btnGenerateArticle').disabled = false;
    document.getElementById('btnGenerateArticle').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13 12H3"/></svg> AI生成文章';
    showToast('⚠️ API调用失败（' + (e.message || '网络错误') + '），已用本地模板生成');
  }
}

// ============ 专业人设 + 平台风格化文章生成引擎 ============

// 话题分析：提取核心关键词 + 判断话题类型
function analyzeTopic(topic) {
  var clean = topic.replace(/[：:：\s\-\|｜·]+/g, '').substring(0, 20);
  var types = [];
  if (/AI|人工智能|大模型|GPT|Claude|ChatGPT|机器学习/.test(topic)) types.push('tech-ai');
  if (/赚钱|变现|涨粉|流量|爆款|运营|转化/.test(topic)) types.push('growth');
  if (/小红书|抖音|快手|视频号|公众号|B站|Bilibili/.test(topic)) types.push('platform');
  if (/短视频|直播|剪辑|拍摄|脚本/.test(topic)) types.push('content');
  if (/数码|手机|汽车|美妆|穿搭|美食|旅行|家居/.test(topic)) types.push('lifestyle');
  if (/职场|副业|面试|简历|跳槽|升职/.test(topic)) types.push('career');
  if (/教育|学习|考研|考证|英语|编程/.test(topic)) types.push('edu');
  if (types.length === 0) types.push('general');
  return { core: clean, types: types };
}

// 通用话题渲染器：根据topic动态生成与主题强相关的内容
function topicSentence(topic, type) {
  var t = escapeHtml(topic);
  var sentences = {
    'tech-ai': [
      '如果你密切关注' + t + '的动态，你会发现一个明显趋势——技术迭代的速度远超大多数人的预期。',
      '据最新行业报告，' + t + '领域在过去半年迎来了新一轮爆发，头部公司纷纷加码布局。',
      '很多人问我：' + t + '到底是不是泡沫？我的答案是：短期可能过热，但长期看，这是一次真正的范式转移。'
    ],
    'growth': [
      '关于' + t + '，我和几个做成的朋友深度聊过，发现成功案例背后都有相同的底层逻辑。',
      t + '这件事，本质上是在考验你对用户需求和平台规则的双重理解。',
      '市面上讲' + t + '的内容很多，但真正讲透\"为什么能赚钱\"的没几个。'
    ],
    'platform': [
      t + '的这次变化，看起来是一个功能更新，实际上可能改变整个内容生态的格局。',
      '我和几个在' + t + '深耕多年的创作者聊了聊，他们对这次变化的态度出奇一致。',
      '不要小看' + t + '的每一步动作——过去5年的经验告诉我们，平台的一个小调整可能会带来创作者的大洗牌。'
    ],
    'content': [
      t + '正在成为创作者之间拉开差距的核心能力。掌握了它的人和没掌握的人，产出效率可能相差10倍。',
      '我花了两周时间研究了100多个' + t + '的成功案例，总结出几个共通的规律。',
      '关于' + t + '，大多数人的认知还停留在表面，真正的高手早在默默深耕了。'
    ],
    'lifestyle': [
      '最近' + t + '这个话题在我的朋友圈刷屏了，身边好几个朋友都在讨论。',
      '作为一个在' + t + '领域折腾了几年的过来人，我觉得大多数攻略都没讲到点子上。',
      t + '这件事，看似简单，但真正做对的人其实不多。'
    ],
    'career': [
      '关于' + t + '，我想说一个可能很多人不愿意承认的事实：大多数人的努力方向可能是错的。',
      '如果你正在考虑' + t + '，我建议你先别急着行动，花5分钟看完这篇分析。',
      '最近好几个朋友都在问' + t + '的事，干脆写篇文章统一聊聊我的看法。'
    ],
    'edu': [
      t + '正在以肉眼可见的速度改变传统的学习方式。作为一个深度体验者，我想聊聊我的观察。',
      '关于' + t + '，大多数人的学习方法可能效率很低。今天我分享一个更高效的方式。',
      '如果你正在为' + t + '花大量时间，这篇文章可能会帮你省下至少50%的时间。'
    ],
    'general': [
      '关于' + t + '这个话题，最近讨论热度居高不下。我做了大量调研，想和你分享我的深度思考。',
      '很多人都在讨论' + t + '，但真正理解其本质的人并不多。这篇文章帮你一次讲清楚。',
      t + '不是一个简单的热点，而是一个值得认真对待的趋势信号。'
    ]
  };
  var pool = sentences[type] || sentences['general'];
  return pool[Math.floor(Math.random() * pool.length)];
}

// 根据平台和话题生成一个有力的小标题
function makeSubtitle(topic, angle, idx) {
  var t = escapeHtml(topic.substring(0, 12));
  var angles = {
    wechat: [
      '一、为什么「' + t + '」值得你认真关注',
      '二、深度拆解「' + t + '」的底层逻辑',
      '三、「' + t + '」正在重塑的三个关键场景',
      '四、实操指南：如何抓住「' + t + '」的窗口期'
    ],
    douyin: [
      '💥 第一个真相：' + t + '远比你想象的更重要',
      '🔥 第二个真相：90%的人都误解了' + t,
      '⚡ 第三个真相：' + t + '的窗口期只剩6个月',
      '🚀 现在就该做的3件事'
    ],
    kuaishou: [
      '咱先聊聊：' + t + '到底是个啥？',
      '我踩过的坑：' + t + '千万别这么干',
      '干货来了：' + t + '的正确打开方式',
      '兄弟听我一句劝'
    ],
    xiaohongshu: [
      '🍃 为什么我劝你一定要关注' + t,
      '📝 手把手教你搞懂' + t + '（建议收藏）',
      '💡 我亲测有效的' + t + '方法',
      '🌟 总结：记住这3点就够了'
    ]
  };
  var pool = angles[angle] || angles['wechat'];
  return pool[idx] || pool[0];
}

// 平台配置：标题前缀 + 内容风格
function makeTitle(topic, platformKey) {
  var t = topic.replace(/^[\s：:]+/, '');
  var prefixes = {
    wechat: '深度解析｜',
    douyin: '重磅！',
    kuaishou: '老铁们注意了！',
    xiaohongshu: '✨建议收藏｜'
  };
  return (prefixes[platformKey] || '') + t;
}

// ===== 微信公众号文章生成 =====
// 人设：资深行业分析师 — 冷静、专业、数据驱动、逻辑严密
function buildWechatArticle(topic, imgs) {
  var t = escapeHtml(topic);
  var tc = analyzeTopic(topic).core;
  var analysis = analyzeTopic(topic);

  var title = makeTitle(topic, 'wechat');

  var content =
    // 引言区：行业观察者视角
    '<div style="background:linear-gradient(135deg, var(--bg-primary), var(--bg-secondary)); padding:24px; border-radius:10px; margin-bottom:20px; border-left:4px solid var(--accent);">'
    + '<p style="font-size:13px; color:var(--accent-light); margin-bottom:8px; letter-spacing:1px;">━━━ 行业深度观察</p>'
    + '<p style="font-size:15px; line-height:1.9; color:var(--text-primary);">' + topicSentence(topic, analysis.types[0]) + '这篇文章，我将从行业分析师的视角，用数据+逻辑为你厘清「<strong>' + t + '</strong>」的全貌。</p>'
    + '</div>'

    // 章节一：现象拆解
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'wechat', 0) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-secondary);">如果你最近察觉到「' + t + '」在各大平台频繁出现，不是你的错觉。它的热度曲线，和三年前的「短视频」、两年前的「AI绘画」在早期阶段高度相似。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary);">但跟风者多，看懂的人少。大部分人只看到表面热度，没有看清背后真正的驱动力量。作为一个持续跟踪内容行业5年的分析师，我认为至少有三个结构性因素在同时作用。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary);"><strong style="color:var(--text-primary);">其一，供给侧的效率革命。</strong>' + tc + '相关工具和方法的成熟，让过去需要团队协作的事情，现在一个人就能完成。效率提升不是10%或20%，而是数倍的跃升。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary);"><strong style="color:var(--text-primary);">其二，需求侧的内容饥渴。</strong>用户对高品质内容的需求正在从\"可有可无\"变成\"硬刚需\"，而' + tc + '恰好填补了传统内容生产的效率缺口。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary);"><strong style="color:var(--text-primary);">其三，平台的主动拥抱。</strong>微信、抖音、小红书等平台都在积极扶持与' + tc + '相关的创作生态，因为平台也需要用优质内容来维持用户留存。</p>'

    + _localFigure(imgs[0], '▲ ' + tc + '相关场景')

    // 章节二：深度分析
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'wechat', 1) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-secondary);">任何一个热点背后，都有它的底层逻辑。我尝试用三层分析框架来拆解「' + t + '」：</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary);"><strong style="color:var(--text-primary);">技术层：</strong>' + tc + '所依托的核心技术进步，正在经历从\"能用\"到\"好用\"的质变。这不是缓慢演进，而是一个拐点。当工具的易用性跨过某个临界值，市场的接受度会呈指数级增长。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary);"><strong style="color:var(--text-primary);">商业层：</strong>从已验证的商业模式来看，' + tc + '的变现路径主要分为三类——效率工具付费（to B）、内容创作变现（to C）、以及流量分发生态（平台侧）。这三条路径目前都出现了明确的盈利模型。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary);"><strong style="color:var(--text-primary);">社会层：</strong>更深远的变化在于，' + tc + '正在改变\"创作\"这件事的准入门槛。当内容生产不再是被少数专业人士垄断的技能，整个内容生态的权力结构也会跟着变化。</p>'

    + _localFigure(imgs[1], '▲ 用三层框架看懂' + tc + '的本质')

    // 章节三：机会点
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'wechat', 2) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-secondary);">趋势看懂了，接下来是更关键的问题：<strong style="color:var(--text-primary);">普通人有没有机会？机会在哪个环节？</strong></p>'
    + '<p style="line-height:1.9; color:var(--text-secondary);">场景一：<strong style="color:var(--text-primary);">内容生产的提效。</strong>如果你已经在做内容，' + tc + '能让你的产出效率从\"一天一篇\"提升到\"一小时一篇\"。省下来的时间可以用来做选题研究和用户互动——这两件事才是真正决定账号天花板的因素。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary);">场景二：<strong style="color:var(--text-primary);">内容形式的拓展。</strong>' + tc + '让你能轻松涉足之前\"想都不敢想\"的内容形式。写文章的人可以做视频，做视频的人可以写深度图文，形式不设限。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary);">场景三：<strong style="color:var(--text-primary);">规模化运营。</strong>一个人运营5个垂直账号不再是天方夜谭。' + tc + '把规模化运营的边际成本降到了接近零——这是过去只有MCN机构才能做到的事。</p>'

    // 章节四：行动指南
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'wechat', 3) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-secondary);">分析了这么多，最终要落地的还是一句话：<strong style="color:var(--text-primary);">你现在应该做什么？</strong>我整理了一个从入门到进阶的三步走策略：</p>'
    + '<div style="background:var(--bg-primary);padding:20px;border-radius:8px;margin:16px 0;">'
    + '<p style="line-height:1.8; color:var(--text-secondary);"><strong style="color:var(--accent-light);">第一步（第1周）：建立认知框架。</strong>花3-5天时间，集中浏览' + tc + '领域的前10篇优质内容，建立自己的判断坐标系。知道什么是好的，什么是凑数的。</p>'
    + '<p style="line-height:1.8; color:var(--text-secondary);"><strong style="color:var(--accent-light);">第二步（第2-4周）：上手实战验证。</strong>选一个最小可行性方向，用' + tc + '辅助产出10条内容。不求量，求质。每条内容发布后认真看数据反馈。</p>'
    + '<p style="line-height:1.8; color:var(--text-secondary);"><strong style="color:var(--accent-light);">第三步（第2-3个月）：跑通闭环。</strong>当你的单条内容有稳定的数据表现后，开始搭建\"内容→流量→沉淀→变现\"的完整链路。</p>'
    + '</div>'

    + _localFigure(imgs[2], '▲ 从认知到变现的三步路线图')

    // 结尾
    + '<div style="background:linear-gradient(135deg, rgba(99,102,241,0.08), rgba(129,140,248,0.04)); padding:20px; border-radius:10px; margin-top:28px;">'
    + '<p style="line-height:1.9; color:var(--text-primary);"><strong>最后说一句：</strong>' + tc + '不是一阵风。每一次技术周期，都会有一批\"先把新工具玩透\"的人跑出来。你现在要做的不是焦虑，而是比别人早半步出发。</p>'
    + '</div>'
    + '<p style="color:var(--accent-light);margin-top:20px;font-size:13px;text-align:right;">—— 本文由 自媒体AI运营平台 生成 | 人设：资深行业分析师 | 面向微信公众号深度阅读场景</p>';

  return { title: title, content: content, img1: imgs[0], img2: imgs[1], img3: imgs[2] };
}

// ===== 抖音文章生成 =====
// 人设：MCN内容操盘手 — 犀利、直接、懂流量、句句扎心
function buildDouyinArticle(topic, imgs) {
  var t = escapeHtml(topic);
  var tc = analyzeTopic(topic).core;
  var analysis = analyzeTopic(topic);

  var title = makeTitle(topic, 'douyin');

  var content =
    // 开篇暴击
    '<div style="background:linear-gradient(135deg, #1a0533, #2d1b69); padding:24px; border-radius:10px; margin-bottom:20px; position:relative; overflow:hidden;">'
    + '<div style="position:absolute;top:10px;right:14px;font-size:11px;color:rgba(255,255,255,0.4);">⚡ MCN操盘手内部笔记</div>'
    + '<p style="font-size:15px; line-height:1.9; color:rgba(255,255,255,0.9); position:relative; z-index:1;">' + topicSentence(topic, analysis.types[0]) + '</p>'
    + '<p style="font-size:14px; line-height:1.9; color:rgba(255,255,255,0.7); position:relative; z-index:1; margin-top:12px;">先跟你说个扎心的事实：关于「<strong style="color:#fbbf24;">' + t + '</strong>」，你刷到的90%的内容都只是在重复信息，真正讲到怎么做的，不足10%。</p>'
    + '</div>'

    // 三个真相（抖音喜欢的"反常识+冲击力"格式）
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'douyin', 0) + '</h3>'
    + '<p style="line-height:1.8; color:var(--text-secondary); font-size:15px;">做内容这么多年，我见过太多人追着' + tc + '跑但完全跑偏方向。真相是：<strong style="color:var(--red);">' + tc + '不是来替代你的，是来放大你的。如果你本来就没什么独特价值，工具再好也白搭。</strong></p>'
    + '<p style="line-height:1.8; color:var(--text-secondary); font-size:15px;">那些喊着"' + tc + '会淘汰所有创作者"的人，要么是为了制造焦虑赚流量，要么是真的没看懂。淘汰的从来不是\"人\"，而是\"不愿意用新工具的人\"。</p>'

    + _localFigure(imgs[0], '▲ 数据不会骗人，但解读数据的人会')

    // 第二个真相
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'douyin', 1) + '</h3>'
    + '<p style="line-height:1.8; color:var(--text-secondary); font-size:15px;">讲一个真实案例。我团队有个00后小伙伴，半年前完全不懂' + tc + '，现在是团队里产出效率最高的人。他只做对了一件事：<strong style="color:var(--accent-light);">不像大多数人那样\"随便试试\"，而是正经把' + tc + '当成一门技能来学。</strong></p>'
    + '<p style="line-height:1.8; color:var(--text-secondary); font-size:15px;">具体来说，他每天花1小时刻意练习：周一选题，周二写稿，周三改稿，周四配图，周五发。6个月下来，他一个人产出了过去3个人才能完成的内容量。</p>'

    + _localFigure(imgs[1], '▲ 刻意练习 vs 随便试试，差距比你想象的大')

    // 第三个真相
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'douyin', 2) + '</h3>'
    + '<p style="line-height:1.8; color:var(--text-secondary); font-size:15px;">这句话可能不好听，但我必须说：<strong style="color:var(--red);">' + tc + '的窗口期不会永远开着。</strong>任何一个新工具/新方法的红利期都是有限的。当所有人都能用的时候，用它就不再是优势，不用它就变成了劣势。</p>'
    + '<p style="line-height:1.8; color:var(--text-secondary); font-size:15px;">根据我的经验，这类技术周期通常有12-18个月的黄金窗口。从目前的时间点来看，你大概还有6-9个月的时间来抢跑。说多不多，说少不少——够你建立先发优势，但经不起拖延。</p>'

    // 行动号召
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'douyin', 3) + '</h3>'
    + '<div style="background:var(--bg-primary);padding:20px;border-radius:8px;margin:16px 0;">'
    + '<p style="line-height:1.8; color:var(--text-secondary); font-size:14px;"><strong style="color:var(--green);">❶ 就现在，</strong>打开你的备忘录，列出3个你最擅长的内容方向，每个方向写一句话说明为什么你比别人讲得更好。</p>'
    + '<p style="line-height:1.8; color:var(--text-secondary); font-size:14px;"><strong style="color:var(--green);">❷ 本周内，</strong>用' + tc + '产出一条内容，无论质量如何先发出去。完美主义是创作者最大的敌人。</p>'
    + '<p style="line-height:1.8; color:var(--text-secondary); font-size:14px;"><strong style="color:var(--green);">❸ 30天内，</strong>跑通你的\"选题→生产→发布→复盘\"闭环。30天之后你会感谢今天开始行动的自己。</p>'
    + '</div>'

    + _localFigure(imgs[2], '▲ 记住：信息不值钱，行动才值钱')

    // CTA
    + '<div style="text-align:center; padding:20px; margin-top:24px; border-top:1px solid var(--border);">'
    + '<p style="font-size:15px; color:var(--text-primary); font-weight:600;">觉得有用的话，保存下来，明天就照着做。</p>'
    + '<p style="font-size:13px; color:var(--text-secondary); margin-top:6px;">—— 一个踩过足够多坑的MCN操盘手</p>'
    + '</div>';

  return { title: title, content: content, img1: imgs[0], img2: imgs[1], img3: imgs[2] };
}

// ===== 快手文章生成 =====
// 人设：从0到百万粉的实战派博主 — 接地气、讲故事、像兄弟聊天
function buildKuaishouArticle(topic, imgs) {
  var t = escapeHtml(topic);
  var tc = analyzeTopic(topic).core;
  var analysis = analyzeTopic(topic);

  var title = makeTitle(topic, 'kuaishou');

  var content =
    // 兄弟开场
    '<div style="background:linear-gradient(135deg, #1a1a0a, #2d2d0f); padding:24px; border-radius:10px; margin-bottom:20px;">'
    + '<p style="font-size:11px; color:var(--orange); margin-bottom:8px; letter-spacing:1px;">🔧 一个实战派的真心话</p>'
    + '<p style="font-size:15px; line-height:1.9; color:var(--text-primary);">兄弟们，今天咱不整那些虚头巴脑的理论。就聊一个事儿——「<strong style="color:var(--yellow);">' + t + '</strong>」到底怎么干，才能真出效果。</p>'
    + '<p style="font-size:14px; line-height:1.9; color:var(--text-secondary); margin-top:12px;">' + topicSentence(topic, analysis.types[0]) + '</p>'
    + '</div>'

    // 故事分享
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'kuaishou', 0) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;">先说个我的真实经历。去年刚开始琢磨' + tc + '的时候，我跟大多数人一样——到处看教程、加群、收藏无数篇文章。结果两个月过去了，啥也没干成。为啥？因为一直在输入，从来没输出。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;">后来我想通了一件事：<strong style="color:var(--yellow);">干就完了，想那么多没用。</strong>我开始不管质量，先整出第一条。丑是丑了点，但发出去之后，评论区有人认真跟我讨论，那一刻我才发现——原来大家要的不是完美，是真实。</p>'

    + _localFigure(imgs[0], '▲ 从0开始最难，但迈出第一步就成功了一半')

    // 踩过的坑
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'kuaishou', 1) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;">踩了无数坑之后，我总结出三个\"千万别犯\"的错误：</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;"><strong style="color:var(--red);">❌ 第一坑：上来就想搞大的。</strong>有些人一研究' + tc + '就想着直接做个爆款，结果啥也没做出来。先从小处着手，先搞出一条完整的内容再说。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;"><strong style="color:var(--red);">❌ 第二坑：只看不练。</strong>教程收藏了几十个G，一条没实践过。兄弟，' + tc + '这种事儿，看100篇攻略不如自己动手干一次。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;"><strong style="color:var(--red);">❌ 第三坑：三天打鱼两天晒网。</strong>兴致来了猛干三天，然后歇两周。内容这事儿讲究的是\"复利\"，你发一条、两条可能没啥反应，但发到第30条的时候，奇迹就发生了。</p>'

    + _localFigure(imgs[1], '▲ 这些坑我都替你踩过了，你就别重复了')

    // 实操方法
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'kuaishou', 2) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;">说完了不能干的，咱聊聊该咋干。我用最土的话给你讲清楚：</p>'
    + '<div style="background:var(--bg-primary);padding:20px;border-radius:8px;margin:16px 0;">'
    + '<p style="line-height:1.8; color:var(--text-secondary);"><strong style="color:var(--orange);">第1步：找对标。</strong>搜' + tc + '相关的内容，找5个你看着顺眼的号，把他们最近20条内容全看一遍。看啥？看他们选题是啥、标题怎么写的、评论区都在讨论啥。</p>'
    + '<p style="line-height:1.8; color:var(--text-secondary);"><strong style="color:var(--orange);">第2步：先模仿再超越。</strong>别一上来就想着\"原创\"。先模仿你找到的那5个号，用他们的选题方向，但加上你自己的经历和观点。模仿不是抄袭，是站在巨人肩膀上。</p>'
    + '<p style="line-height:1.8; color:var(--text-secondary);"><strong style="color:var(--orange);">第3步：坚持30天。</strong>每天一条，连续30天。别管数据好不好看，先把\"持续产出\"这个习惯建立起来。30天后你回头看第一条，会觉得\"这啥玩意儿\"——这说明你进步了。</p>'
    + '</div>'

    + _localFigure(imgs[2], '▲ 三步走，简简单单但真能出效果')

    // 结尾叮嘱
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'kuaishou', 3) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-primary); font-size:15px;">兄弟，我说了这么多，你只需要记住一句话：<strong style="color:var(--yellow);">' + tc + '不是啥高深学问，它就是一把锤子——锤子能砸钉子，但你得先拿起来用。</strong></p>'
    + '<div style="text-align:center; padding:20px; margin-top:16px;">'
    + '<p style="font-size:14px; color:var(--text-secondary);">觉得有用的话，点个赞，评论区告诉我你想先从哪一步开始 👇</p>'
    + '</div>';

  return { title: title, content: content, img1: imgs[0], img2: imgs[1], img3: imgs[2] };
}

// ===== 小红书文章生成 =====
// 人设：生活方式策展人 — 精致、温暖、审美在线、利他分享
function buildXiaohongshuArticle(topic, imgs) {
  var t = escapeHtml(topic);
  var tc = analyzeTopic(topic).core;
  var analysis = analyzeTopic(topic);

  var title = makeTitle(topic, 'xiaohongshu');

  var content =
    // 封面级开场
    '<div style="background:linear-gradient(135deg, #fdf2f8, #fce7f3); padding:24px; border-radius:12px; margin-bottom:20px;">'
    + '<p style="font-size:13px; color:#db2777; margin-bottom:8px; font-weight:600;">🌸 生活方式·深度分享</p>'
    + '<p style="font-size:15px; line-height:1.9; color:#4a044e;">' + topicSentence(topic, analysis.types[0]) + '</p>'
    + '<p style="font-size:14px; line-height:1.9; color:#6b21a8; margin-top:12px;">花了两周时间整理了这份「<strong>' + t + '</strong>」完整攻略，纯干货无废话，建议先<a style="color:#db2777;">🌟收藏</a>再慢慢看～</p>'
    + '</div>'

    // 共情开场
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'xiaohongshu', 0) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;">有没有这种感觉？每次刷到' + tc + '相关的内容都在收藏夹吃灰，收藏了几百条但一次都没真正行动过？😅 我曾经也是这样，直到上个月我下定决心花时间把这件事彻底研究透。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;">这篇笔记就是我的研究成果，用最舒服的排版呈现给你，保证你读完之后能立刻上手 ✨</p>'

    + _localFigure(imgs[0], '▲ 看完这篇，你也能轻松搞定' + tc + '')

    // 核心攻略
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'xiaohongshu', 1) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;">直接上干货，我把' + tc + '的方法论浓缩成了一份超详细清单 📋</p>'
    + '<div style="background:var(--bg-primary);padding:20px;border-radius:10px;margin:16px 0;">'
    + '<p style="line-height:2; color:var(--text-secondary);"><strong style="color:var(--accent-light);">🧩 第1步 | 明确你的方向</strong><br>先问自己三个问题：<br>▸ 我的兴趣和' + tc + '有什么交集？<br>▸ 我能为目标用户解决什么具体问题？<br>▸ 什么样的内容形式最适合我的表达习惯？</p>'
    + '<p style="line-height:2; color:var(--text-secondary); margin-top:14px;"><strong style="color:var(--accent-light);">✍️ 第2步 | 建立内容模板</strong><br>根据你的方向，创建一个可复用的内容框架：<br>▸ 标题公式：【核心利益点 + 具体数字 + 情感共鸣词】<br>▸ 正文结构：【问题引入→我的体验→核心干货→互动引导】<br>▸ 配图风格：【统一滤镜 + 统一字体 + 统一版式】</p>'
    + '<p style="line-height:2; color:var(--text-secondary); margin-top:14px;"><strong style="color:var(--accent-light);">🔄 第3步 | 持续优化迭代</strong><br>▸ 每条内容发布后，记录数据表现<br>▸ 每周复盘：哪类选题数据好？哪种标题点击率高？<br>▸ 不断调整方向，直到找到最适合你的赛道</p>'
    + '</div>'

    + _localFigure(imgs[1], '▲ 三步框架，简单清晰')

    // 亲测经验
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'xiaohongshu', 2) + '</h3>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;">用这个方法我实测了一个月，分享几个真实感受 💭</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;"><strong style="color:#db2777;">▸ 第一周最痛苦</strong>——找不到方向，什么都想试。后来我强迫自己先从一个最小切口切入，反而效率高了很多。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;"><strong style="color:#db2777;">▸ 第二周开始上瘾</strong>——当你看到第一条内容有人认真回复的时候，那种正反馈是会上瘾的。真的。</p>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:15px;"><strong style="color:#db2777;">▸ 一个月后的变化</strong>——产出效率提升了至少3倍，而且最重要的变化是：不再有\"今天写什么\"的焦虑了，因为方法已经内化成了习惯。</p>'

    // 总结
    + '<h3 style="font-size:18px; margin:28px 0 12px; color:var(--text-primary);">' + makeSubtitle(topic, 'xiaohongshu', 3) + '</h3>'
    + '<div style="background:linear-gradient(135deg, rgba(219,39,119,0.08), rgba(168,85,247,0.06)); padding:20px; border-radius:10px; margin:16px 0;">'
    + '<p style="line-height:1.9; color:var(--text-primary); font-size:14px;">🌷 <strong>总结一下：</strong></p>'
    + '<p style="line-height:1.9; color:var(--text-secondary); font-size:14px;">① ' + tc + '不是一个\"要不要做\"的问题，而是\"什么时候开始、怎么做\"的问题。<br>② 不用追求完美，能跑起来比完美重要100倍。<br>③ 找到自己的节奏，享受创作的过程。</p>'
    + '</div>'

    + _localFigure(imgs[2], '▲ 希望这份攻略能帮到你 ✨')

    // 互动引导
    + '<div style="text-align:center; padding:20px; margin-top:24px; border-top:1px solid var(--border);">'
    + '<p style="font-size:14px; color:var(--text-secondary);">📮 如果这篇笔记对你有帮助，记得 <strong style="color:#db2777;">点赞 + 收藏</strong> 哦～</p>'
    + '<p style="font-size:13px; color:var(--text-secondary); margin-top:8px;">有任何问题评论区告诉我，看到了都会回 💌</p>'
    + '</div>';

  return { title: title, content: content, img1: imgs[0], img2: imgs[1], img3: imgs[2] };
}

// ============ 主入口：根据平台分发到对应的人设生成器 ============

// 本地模板兜底的插图渲染。
// ⚠️ 原来这里给的是 picsum.photos 随机图 —— 一篇讲猫砂盆的文章配三张随机风景照，
// 就是用户报的"配图不应景"。现在 AI 出不了图就**不放图**，连图注一起省掉，
// 免得留下一句"▲ 三步框架" 却没有对应画面。
function _localFigure(url, caption) {
  if (!url) return '';
  return '<div style="margin:24px 0;"><img src="' + safeUrl(url) + '" alt="' + escapeAttr(caption || '') + '" referrerpolicy="no-referrer" style="width:100%;border-radius:8px;display:block;" onerror="this.parentNode.style.display=\'none\'">'
    + '<p style="font-size:12px;color:var(--text-secondary);text-align:center;margin-top:8px;">' + escapeHtml(caption || '') + '</p></div>';
}

function buildArticleContent(topic, platform, platformKey, realImages) {
  // 只接受真实生成/抓取到的图；拿不到就是空数组，模板会自动跳过插图位
  var imgs = Array.isArray(realImages) ? realImages.slice(0, 3) : [];

  switch (platformKey) {
    case 'douyin':    return buildDouyinArticle(topic, imgs);
    case 'kuaishou':  return buildKuaishouArticle(topic, imgs);
    case 'xiaohongshu': return buildXiaohongshuArticle(topic, imgs);
    default:          return buildWechatArticle(topic, imgs);
  }
}

// ============ EDITOR ============
function openEditor() {
  if (!currentArticle) return;
  var modal = document.getElementById('editorModal');
  modal.style.display = 'flex';
  document.getElementById('editorContent').innerHTML = currentArticle.content;
  document.getElementById('editorPlatformLabel').textContent = '面向：' + (platformNames[selectedPlatform] || '微信公众号');
}
function closeEditor() { document.getElementById('editorModal').style.display = 'none'; }

function saveArticleFull() {
  if (!currentArticle) return;
  var newContent = document.getElementById('editorContent').innerHTML;
  currentArticle.content = newContent;

  // 1) 立即回写主页预览区正文，保证主页面文章同步更新（修复：保存后主页不刷新）
  var previewBody = document.querySelector('#articlePreview .article-body');
  if (previewBody) previewBody.innerHTML = newContent;

  // 2) 同步到资产数组（按标题匹配）并持久化，保证资产库与刷新后内容一致
  for (var i = 0; i < generatedArticles.length; i++) {
    if (generatedArticles[i].title === currentArticle.title) {
      generatedArticles[i].content = newContent;
    }
  }
  saveAppData();

  closeEditor();
  showToast('✅ 全文已保存！主页文章、复制全文与导出均使用最新内容');
}

// 插入图片
function insertImage() {
  var url = prompt('请输入图片URL（或留空使用随机配图）：', 'https://picsum.photos/seed/' + Math.floor(Math.random()*10000) + '/600/400');
  if (url) {
    document.execCommand('insertHTML', false, '<img src="' + url + '" alt="配图" style="max-width:100%;border-radius:8px;margin:12px 0;display:block;">');
  }
}

// 复制带格式的HTML内容
function copyArticleHtml() {
  var content = document.getElementById('editorContent').innerHTML;
  // 创建一个临时div，把HTML内容放进去
  var tempDiv = document.createElement('div');
  tempDiv.style.position = 'fixed';
  tempDiv.style.left = '-9999px';
  tempDiv.innerHTML = content;
  document.body.appendChild(tempDiv);

  // 选中内容并复制
  var range = document.createRange();
  range.selectNodeContents(tempDiv);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  try {
    var ok = document.execCommand('copy');
    if (ok) { showToast('文章已复制（含格式），可直接粘贴到公众号/小红书等平台'); }
    else { fallbackCopyText(document.getElementById('editorContent').innerText); }
  } catch(e) {
    fallbackCopyText(document.getElementById('editorContent').innerText);
  }
  sel.removeAllRanges();
  document.body.removeChild(tempDiv);
}

function fallbackCopyText(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast('文章已复制到剪贴板（纯文本）'); } catch(e) { showToast('复制失败，请手动复制'); }
  document.body.removeChild(ta);
}

// 导出为HTML文件
function exportArticle() {
  var htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + (currentArticle ? escapeHtml(currentArticle.title) : '文章') + '</title>'
    // 导出的是独立文件，拿不到页面的 CSS 变量，字体栈必须写成字面量。
    // 与站内 --font-stack 保持一致：英文 Calibri，中文逐字形回落到宋体。
    + '<style>body{font-family:Calibri,"Segoe UI","Helvetica Neue",Arial,SimSun,"宋体","Songti SC","Noto Serif CJK SC",serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.8;color:#333;} h2{font-size:24px;} h3{font-size:18px;margin-top:24px;} img{max-width:100%;border-radius:8px;margin:16px 0;} blockquote{border-left:3px solid #6366f1;padding-left:16px;color:#666;}</style></head><body>'
    + document.getElementById('editorContent').innerHTML
    + '</body></html>';
  var blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (currentArticle ? currentArticle.title.substring(0, 30) : '文章') + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('文章已导出为HTML文件');
}

// 发布：一键跳转至对应国内自媒体平台创作后台，由用户自行登录发布
function publishArticle() {
  var url = platformPublishUrls[selectedPlatform] || 'https://creator.xiaohongshu.com/publish/publish';
  var pname = platformNames[selectedPlatform] || '目标平台';
  showToast('正在打开 ' + pname + ' 发布后台，平台不支持一键直发，请登录后自行粘贴内容发布…');
  setTimeout(function() { window.open(url, '_blank', 'noopener'); }, 500);
}

// ============ 视频脚本生成引擎（平台风格化） ============
// 人设：不同平台的视频策划专家
function buildVideoScript(fullTitle, shortTitle, platformKey, platformName, durationSec) {
  durationSec = durationSec || 30;
  var topicCore = (shortTitle || fullTitle || '').substring(0, 40);

  // Section timing: hook 15% + body 50% + close 35%
  var hookSec   = Math.max(3, Math.round(durationSec * 0.15));
  var middleSec = Math.round(durationSec * 0.5);
  var t1 = '00:00–00:' + String(hookSec).padStart(2, '0');
  var t2 = '00:' + String(hookSec).padStart(2, '0') + '–00:' + String(hookSec + middleSec).padStart(2, '0');
  var t3 = '00:' + String(hookSec + middleSec).padStart(2, '0') + '–00:' + String(durationSec).padStart(2, '0');

  var hookText, middleText, endText;
  if (platformKey === 'douyin') {
    hookText   = '⚡ 打断刷屏的钩子（前 ' + hookSec + ' 秒决定生死）\n  画面：快切 / 第一视角 / 直视镜头\n  口播：「关于' + topicCore + '，没人跟你说实话，我说。」\n  字幕：粗体大字压在画面上三分之一';
    middleText = '🔥 干货密集段（' + middleSec + ' 秒）\n  画面：快切实拍 B-roll，屏幕上带编号字幕\n  口播：「三件事就能翻盘：第一…… 第二…… 第三……」';
    endText    = '📣 强互动收尾\n  口播：「想看第二条的评论区扣 1，明天更。」画面不堆话题标签';
  } else if (platformKey === 'kuaishou') {
    hookText   = '🤝 老铁式开场（' + hookSec + ' 秒）\n  画面：真人半身，直视镜头，实拍不摆拍\n  口播：「' + topicCore + '这事，我踩过坑，今天跟你说实在的。」';
    middleText = '💪 实在感对比段（' + middleSec + ' 秒）\n  画面：手持实拍 + 同类对比 + 敢报价\n  口播：大白话讲清「贵在哪、便宜在哪、值不值」';
    endText    = '🛒 进直播间引导\n  口播：「今晚八点直播间给到底价，主页点个关注别错过。」';
  } else if (platformKey === 'shipinhao') {
    hookText   = '💡 值得转发的开场（' + hookSec + ' 秒）\n  画面：稳定机位，人物中景，光线干净\n  口播：「' + topicCore + '，我把它讲明白了，你可以直接转给需要的人。」';
    middleText = '📖 观点推进段（' + middleSec + ' 秒）\n  画面：讲述人与图示交替，节奏平稳\n  口播：情境 → 冲突 → 结论，情绪正向不煽动';
    endText    = '🔁 点赞转发引导\n  口播：「觉得有用点个赞，公众号里有完整版。」';
  } else if (platformKey === 'xiaohongshu') {
    hookText   = '✨ 真诚分享式开场（' + hookSec + ' 秒）\n  画面：干净有质感的平铺 / 特写 / 生活场景，自然光\n  口播：「' + topicCore + '我终于搞明白了，姐妹们别再踩坑。」\n  字幕：细体中文字幕，居中偏上';
    middleText = '📸 三个种草点（' + middleSec + ' 秒）\n  画面：3 个美学镜头，每个 3–4 秒，暖调自然光\n  口播：「先…… 再…… 最后……」语气像跟朋友聊';
    endText    = '💛 收藏引导\n  口播：「先收藏，评论区告诉我你想先试哪个。」不用绝对化用词';
  } else {
    // B站（默认）
    hookText   = '🎯 直接抛结论（' + hookSec + ' 秒）\n  画面：大景 → 切到讲述人，允许贴梗图\n  口播：「接下来 ' + Math.round(durationSec) + ' 秒，把' + topicCore + '一次说清楚，不讲废话。」\n  字幕：章节标记';
    middleText = '📊 高密度三段论（' + middleSec + ' 秒）\n  画面：分屏演示、数据标注、时间轴\n  口播：「第一点…… 第二点…… 第三点……」每点必须带具体数字或案例';
    endText    = '📬 三连引导\n  口播：「这期有用的话，三连一下，下期挖得更深。」';
  }

  return '【短视频分镜脚本 | 目标平台：' + platformName + '】\n' +
    '🎯 平台调性：' + platformName + '原生\n' +
    '⏱ 时长：' + durationSec + ' 秒  |  📐 画幅：9:16 竖屏（B站长视频可用 16:9）\n' +
    '━━━━━━━━━━━━━━━━━━\n\n' +
    '[' + t1 + '] ' + hookText + '\n\n' +
    '[' + t2 + '] ' + middleText + '\n\n' +
    '[' + t3 + '] ' + endText + '\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '📋 制作备注：\n' +
    '• 总时长 ' + durationSec + ' 秒 —— 节奏按' + platformName + '的习惯调。\n' +
    '• 配乐音量压到口播的 30% 以内。\n' +
    '• 每句口播都要压中文硬字幕；抖音/快手用无衬线粗体，小红书用细体，B站可加弹幕位留白。';
}
function selectVideoPlatform(platform, el) {
  selectedVideoPlatform = platform;
  var chips = document.querySelectorAll('#section-video .platform-chip');
  for (var i = 0; i < chips.length; i++) { chips[i].classList.remove('active'); }
  el.classList.add('active');
}

function validateDuration(input) {
  var v = parseInt(input.value, 10);
  if (isNaN(v) || v < 5) { input.value = 5; showToast('⚠️ 视频时长最少5秒'); }
  if (v > 60) { input.value = 60; showToast('⚠️ 视频时长最多60秒'); }
}

function selectVideoModel(model, el) {
  selectedVideoModel = model;
  var chips = document.querySelectorAll('#section-video .video-model-chip');
  for (var i = 0; i < chips.length; i++) { chips[i].classList.remove('active'); }
  el.classList.add('active');
}

function updateVideoSourceSelect() {
  var select = document.getElementById('videoSource');
  select.innerHTML = '<option value="">从已生成的文章中选择...</option>';
  for (var i = 0; i < generatedArticles.length; i++) {
    var opt = document.createElement('option');
    opt.value = i;
    var title = generatedArticles[i].title;
    if (title.length > 40) title = title.substring(0, 40) + '...';
    opt.textContent = '[' + generatedArticles[i].platform + '] ' + title;
    select.appendChild(opt);
  }
}

async function generateScript() {
  var idx = document.getElementById('videoSource').value;
  var articleTitle = '';
  var articleContent = '';
  if (idx !== '') {
    var art = generatedArticles[parseInt(idx)];
    articleTitle = art.title;
    articleContent = currentArticle && currentArticle.title === art.title ? currentArticle.content : '';
  } else if (currentArticle) {
    articleTitle = currentArticle.title;
    articleContent = currentArticle.content || '';
  }
  if (!articleTitle) { showToast('请先生成一篇文章，或从上方选择素材来源'); return; }

  // 读取视频时长（秒）
  var durationSec = parseInt(document.getElementById('videoDuration').value, 10) || 15;
  if (durationSec < 5) durationSec = 5;
  if (durationSec > 60) durationSec = 60;

  document.getElementById('btnGenScript').disabled = true;
  var scriptModelName = modelNameById(getPickedModelId('video-script')) || '大模型';
  document.getElementById('btnGenScript').innerHTML = '<div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> ' + scriptModelName + '生成中...';

  var platformLabels = { douyin: '抖音', kuaishou: '快手', shipinhao: '微信视频号', xiaohongshu: '小红书', bilibili: 'B站' };
  var pl = platformLabels[selectedVideoPlatform] || '抖音';
  var shortTitle = articleTitle.length > 25 ? articleTitle.substring(0, 25) + '...' : articleTitle;
  var topicCore = shortTitle.substring(0, 30);

  try {
    // 国内 5 平台中文 system prompt
    var scriptSystemPrompts = {
      douyin: '你是抖音头部短视频操盘手。抖音的生死线在前 3 秒 —— 你写的钩子必须打断刷屏惯性，口播短促有信息量，画面切换快，字幕跟读，结尾一句强互动引导。分镜带时间轴，语气接地气，绝不用官腔和书面语。',
      kuaishou: '你是快手短视频操盘手。快手吃「老铁信任感」—— 你写的开场像真人跟熟人说话，强调真实、实在、性价比，敢报价敢对比。分镜带时间轴，口播用大白话，结尾引导进直播间或看主页。',
      shipinhao: '你是微信视频号内容策划。视频号的流量来自社交推荐，内容要有转发动机 —— 观点清楚、情绪正向、值得发给朋友或家人群。分镜带时间轴，语气稳重可信，结尾引导点赞转发或看公众号长文。',
      xiaohongshu: '你是小红书爆款视频笔记策划。小红书吃「真诚分享感」—— 开场像闺蜜安利，画面干净有质感（平铺、特写、生活场景），口播不硬广，结尾引导收藏和评论区提问。分镜带时间轴，禁止绝对化用词和硬广话术。',
      bilibili: '你是 B 站 UP 主内容策划。B 站观众吃干货和梗，忍不了废话开场 —— 你写的开场直接抛结论或抛冲突，中段密度高、有数据有对比，结尾一句「三连」引导。分镜带时间轴，允许玩梗和弹幕互动设计。'
    };
    // 优先用「提示词配置 · 短视频生成」里该平台的人设（用户可改），读不到才用上面的内置兜底
    var _vidPromptId = { douyin: 'video-douyin', kuaishou: 'video-kuaishou', shipinhao: 'video-shipinhao', xiaohongshu: 'video-xiaohongshu', bilibili: 'video-bilibili' }[selectedVideoPlatform];
    var _vidConfigured = null;
    if (_vidPromptId) {
      var _allPrompts = (typeof getPrompts === 'function') ? getPrompts() : [];
      for (var _vi = 0; _vi < _allPrompts.length; _vi++) {
        if (_allPrompts[_vi].id === _vidPromptId) { _vidConfigured = _allPrompts[_vi].content; break; }
      }
    }
    var scriptSystem = (_vidConfigured || scriptSystemPrompts[selectedVideoPlatform] || scriptSystemPrompts['douyin'])
      + '\n\n【硬性要求】整份分镜必须用简体中文写，口播与字幕都是中文（品牌名/型号可保留原文）。场景与话术全部用国内语境，不要出现海外平台或海外节日的说法。';

    // 商品情报入口：若存在商品上下文，注入卖点/描述以生成带货式脚本
    var productBlockForScript = '';
    if (currentProductContext) {
      productBlockForScript = '\n\n=== 商品情报（素材，已由用户核对过；把卖点自然揉进口播）===\n' + getReviewedProductText() + '\n=================================================================\n用国内带货短视频的节奏：钩子 → 说痛点 → 3 个核心卖点镜头 → 引导（进直播间 / 点购物车 / 评论区要链接）。';
    }

    var scriptUserPrompt = '为「' + pl + '」写一份 ' + durationSec + ' 秒的短视频分镜脚本。\n\n' +
      '文章标题：「' + articleTitle + '」\n' +
      '核心主题：' + topicCore + '\n' +
      (articleContent ? '文章摘录：' + articleContent.substring(0, 500) : '') + '\n\n' +
      '要求：\n' +
      '1. 按时间轴分段（总时长 ' + durationSec + ' 秒，每段约 5–10 秒），标注成 [00:00–00:05] 这种格式。\n' +
      '2. 每段包含：画面描述、口播/台词、屏幕字幕提示。\n' +
      '3. 结尾给制作备注（打光 / 配乐风格 / 剪辑节奏）。\n' +
      '4. 纯文本输出 —— 不要 markdown 代码围栏。\n' +
      '5. 全文简体中文。' +
      productBlockForScript;

    var script = await callModuleText('video-script', scriptSystem, scriptUserPrompt);

    document.getElementById('scriptContent').textContent = normalizeCopyText(script);
    document.getElementById('scriptResult').style.display = 'block';
    document.getElementById('btnGenScript').disabled = false;
    document.getElementById('btnGenScript').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg> 重新生成脚本';

    updateVideoPreview(articleTitle, pl, durationSec);
    setTimeout(function() { document.getElementById('scriptResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
    var scriptSuccessName = modelNameById(getPickedModelId('video-script')) || '大模型';
    showToast('✅ ' + scriptSuccessName + ' 已生成 ' + pl + ' 风格分镜（' + durationSec + ' 秒）');

    // 保存到自媒体资产
    var scriptContent = document.getElementById('scriptContent').textContent;
    generatedScripts.push({ title: articleTitle || '短视频脚本', platform: pl, content: scriptContent, date: new Date().toLocaleString() });
    flushAssets();   // 生成即入库

  } catch (e) {
    // API 失败，回退本地脚本引擎
    console.error('Script API error:', e);
    var fallbackScript = buildVideoScript(articleTitle, shortTitle, selectedVideoPlatform, pl, durationSec);
    document.getElementById('scriptContent').textContent = fallbackScript;
    document.getElementById('scriptResult').style.display = 'block';
    document.getElementById('btnGenScript').disabled = false;
    document.getElementById('btnGenScript').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg> 重新生成脚本';
    updateVideoPreview(articleTitle, pl, durationSec);
    showToast('⚠️ 接口调用失败 —— 已用本地引擎生成分镜（' + durationSec + ' 秒）');
  }
}

function updateVideoPreview(title, platform, durationSec) {
  var container = document.getElementById('videoPreviewContainer');
  var shortTitle = title.length > 15 ? title.substring(0, 15) + '...' : title;
  container.innerHTML = '<div style="width:100%;height:100%;min-height:400px;border-radius:12px;overflow:hidden;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);position:relative;">'
    + '<div style="position:absolute;inset:0;background:linear-gradient(transparent 50%,rgba(0,0,0,0.8));pointer-events:none;z-index:1;"></div>'
    + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;z-index:2;">'
    + '<div style="width:80px;height:80px;border-radius:50%;background:rgba(99,102,241,0.3);display:flex;align-items:center;justify-content:center;margin-bottom:16px;border:2px solid rgba(99,102,241,0.6);">'
    + '<svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(129,140,248,0.9)"><polygon points="9,6 19,12 9,18"/></svg>'
    + '</div>'
    + '<div style="font-size:13px;color:white;font-weight:600;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,0.5);">' + escapeHtml(shortTitle) + '</div>'
    + '<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:6px;">' + platform + ' | ' + String(durationSec).padStart(2,'0') + ':00</div>'
    + '</div>'
    + '<div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,0.1);z-index:3;"><div style="width:30%;height:100%;background:var(--accent);border-radius:0 2px 2px 0;"></div></div>'
    + '<div style="position:absolute;bottom:8px;right:10px;font-size:10px;color:rgba(255,255,255,0.7);z-index:4;">▶ 预览中</div>'
    + '</div>';
}

function copyScript() {
  var script = document.getElementById('scriptContent').textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(script).then(function() { showToast('脚本已复制到剪贴板'); }).catch(function() { fallbackCopyText(script); });
  } else { fallbackCopyText(script); }
}

function exportScript() {
  var script = document.getElementById('scriptContent').textContent;
  if (!script) { showToast('暂无脚本内容可导出'); return; }
  var blob = new Blob([script], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '短视频脚本_' + new Date().toISOString().slice(0,10) + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✅ 脚本已导出为 .txt 文件');
}

var originalScriptText = '';
function editScript() {
  var div = document.getElementById('scriptContent');
  originalScriptText = div.textContent;
  div.innerHTML = '<textarea id="scriptEditor" style="width:100%;min-height:300px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--accent);border-radius:8px;padding:14px;font-family:inherit;font-size:13px;line-height:1.8;resize:vertical;outline:none;">' + escapeHtml(originalScriptText) + '</textarea>';
  document.getElementById('btnEditScript').style.display = 'none';
  document.getElementById('scriptEditActions').style.display = 'flex';
  showToast('📝 正在编辑脚本中...');
}

function saveScript() {
  var textarea = document.getElementById('scriptEditor');
  if (!textarea) return;
  var newText = textarea.value.trim();
  if (!newText) { showToast('脚本内容不能为空'); return; }
  document.getElementById('scriptContent').textContent = newText;
  document.getElementById('btnEditScript').style.display = '';
  document.getElementById('scriptEditActions').style.display = 'none';
  showToast('✅ 脚本已保存');
}

function cancelEditScript() {
  document.getElementById('scriptContent').textContent = originalScriptText;
  document.getElementById('btnEditScript').style.display = '';
  document.getElementById('scriptEditActions').style.display = 'none';
  showToast('已取消编辑');
}

// 生成视频（调用 MiniMax Hailuo 视频生成 API）
async function generateVideo() {
  syncVideoModelFromPicker('video');  // 让下拉框选择驱动旧的状态变量
  var scriptContent = document.getElementById('scriptContent').textContent.trim();
  var title = currentArticle ? currentArticle.title : '';
  if (!scriptContent) {
    showToast('请先生成或填写视频脚本');
    return;
  }

  document.getElementById('btnGenVideo').disabled = true;
  var genVideoModelNames = { hunyuan: '腾讯混元 hy-video-1.5', minimax: 'MiniMax T2V-01', agnes: 'Agnes AI video-v2.0', agnes25: 'Agnes AI Video 2.5', 'seedance-mini': 'Seedance 2 Mini' };
  var genVideoModelName = genVideoModelNames[selectedVideoModel] || 'Seedance 2 Mini';
  document.getElementById('btnGenVideo').innerHTML = '<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> ' + genVideoModelName + ' 生成中...';
  document.getElementById('videoPreviewArea').style.display = 'none';

  // 读取用户设定的视频时长（秒）
  var durationSec = parseInt(document.getElementById('videoDuration').value, 10) || 15;
  if (durationSec < 5) durationSec = 5;
  if (durationSec > 60) durationSec = 60;

  // 从脚本中提取关键场景描述作为视频 prompt
  var promptLines = scriptContent.split('\n').filter(function(l) { return l.indexOf('画面') !== -1 || l.indexOf('场景') !== -1 || /\bvisual\b|\bshot\b/i.test(l); });
  // 骨架也要中文：分镜内容本身是中文，外面套一层英文只会让模型两种语言里挑一种猜
  var videoPromptRaw = '短视频主题：' + title + '。' + (promptLines.length > 0 ? promptLines.slice(0, 3).join('。') : '现代内容创作场景，专业、有动感，适合国内短视频平台。');
  // 追加字幕/口播中文约束，详见 ensureCnVisualPrompt
  var videoPrompt = await ensureCnVisualPrompt(videoPromptRaw, 'video');

  try {
    // 显示进度
    var modelLabels = { hunyuan: '腾讯混元 HunyuanVideo', minimax: 'MiniMax Hailuo', agnes: 'Agnes AI video-v2.0', agnes25: 'Agnes AI Video 2.5', 'seedance-mini': 'Seedance 2 Mini' };
    var modelLabel = modelLabels[selectedVideoModel] || 'Seedance 2 Mini';
    var wrapper = document.getElementById('videoResultWrapper');
    wrapper.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);">'
      + '<p style="font-size:14px;">🎬 ' + modelLabel + ' 正在生成视频...</p>'
      + '<p style="font-size:12px;margin-top:8px;">预计需要1-3分钟，请耐心等待</p>'
      + '<p id="videoProgressText" style="font-size:11px;margin-top:6px;color:var(--accent-light);">提交任务中...</p>'
      + '</div>';
    document.getElementById('videoResult').style.display = 'block';

    // 根据选择的模型调用对应 API
    var videoUrl;
    var progressCb = function(poll, maxPoll, status) {
      var prog = document.getElementById('videoProgressText');
      if (prog) prog.textContent = '轮询第 ' + poll + '/' + maxPoll + ' 次 | 状态: ' + (status || 'processing');
    };
    
    if (selectedVideoModel === 'hunyuan') {
      videoUrl = await callHunyuanVideo(videoPrompt, progressCb, durationSec, null, null);
    } else if (selectedVideoModel === 'agnes') {
      videoUrl = await callAgnesVideo(videoPrompt, progressCb, durationSec, null, null);
    } else if (selectedVideoModel === 'agnes25') {
      videoUrl = await callAgnesVideo25(videoPrompt, progressCb, durationSec, null, null);
    } else if (selectedVideoModel === 'seedance-mini') {
      videoUrl = await callSeedanceMiniVideo(videoPrompt, progressCb, durationSec, null, null);
    } else {
      videoUrl = await callMiniMaxVideo(videoPrompt, progressCb, durationSec, null, null);
    }

    // 渲染视频
    var isHunyuan = selectedVideoModel === 'hunyuan';
    var isAgnes = selectedVideoModel === 'agnes' || selectedVideoModel === 'agnes25' || selectedVideoModel === 'seedance-mini';
    var modelTags = {
      hunyuan: '<span style="font-size:12px;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">🤖 腾讯混元 hy-video-1.5 生成</span>',
      minimax: '<span style="font-size:12px;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">🤖 MiniMax Hailuo 生成</span>',
      agnes: '<span style="font-size:12px;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">🤖 Agnes AI video-v2.0 生成</span>',
      agnes25: '<span style="font-size:12px;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">🤖 Agnes AI Video 2.5 生成</span>',
      'seedance-mini': '<span style="font-size:12px;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">🤖 Seedance 2 Mini 生成</span>'
    };
    var modelTag = modelTags[selectedVideoModel] || modelTags.agnes;

    // 混元视频：去掉 muted，添加 id 以支持 BGM 同步
    var videoAttrs = isHunyuan
      ? 'controls autoplay playsinline style="width:100%;display:block;border-radius:12px;max-height:500px;" id="videoResultVideo"'
      : 'controls autoplay muted playsinline style="width:100%;display:block;border-radius:12px;max-height:500px;"';
    var bgmSection = isHunyuan ? buildBgmSelectorHtml() : '';

    wrapper.innerHTML = '<div style="margin-bottom:12px;padding:10px 12px;border:1px solid rgba(16,185,129,0.35);background:rgba(16,185,129,0.08);border-radius:10px;color:var(--green);font-size:13px;font-weight:600;">视频生成成功，已获取视频地址并加载预览</div>'
      + '<video ' + videoAttrs + ' onerror="this.style.display=\'none\';this.insertAdjacentHTML(\'afterend\',\'<div style=&quot;padding:12px;color:var(--text-secondary);font-size:12px;&quot;>浏览器暂时无法内嵌播放，请点击下方链接打开视频。</div>\')">'
      + '<source src="' + safeUrl(videoUrl) + '" type="video/mp4">'
      + '您的浏览器不支持视频播放，<a href="' + safeUrl(videoUrl) + '" target="_blank">点击下载视频</a>'
      + '</video>'
      + bgmSection
      + '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">'
      + modelTag
      + '<span style="font-size:12px;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">' + String(durationSec).padStart(2,'0') + ':00</span>'
      + '<span style="font-size:12px;color:var(--green);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">' + (selectedVideoModel === 'agnes25' ? '720P' : '768P') + '</span></div>'
      + '<div style="margin-top:10px;font-size:12px;color:var(--text-secondary);word-break:break-all;">视频链接：<a href="' + safeUrl(videoUrl) + '" target="_blank" style="color:var(--accent-light);">' + escapeHtml(videoUrl) + '</a></div>'
      + '<p style="font-size:11px;color:var(--text-secondary);margin-top:8px;">⚠️ 视频URL 24小时后过期，请及时下载</p>';

    // 混元视频：绑定 BGM 同步
    if (isHunyuan) {
      setTimeout(function() {
        var v = document.getElementById('videoResultVideo');
        if (v && currentBgmId !== 'none') syncBgmWithVideo(v);
      }, 200);
    }

    document.getElementById('videoResult').style.display = 'block';
    document.getElementById('btnGenVideo').disabled = false;
    document.getElementById('btnGenVideo').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg> 重新生成视频';
    showToast('✅ ' + modelLabel + ' 视频已生成！');

    // 保存到自媒体资产：只有真实有效的视频 URL 才入库，失败或空地址不入库
    var savedVideoUrl = '';
    var vEl = document.querySelector('#videoResultWrapper video source');
    if (vEl) savedVideoUrl = vEl.src;
    if (isValidGeneratedMediaUrl(savedVideoUrl)) {
      generatedVideos.push({ title: title || '短视频', platform: selectedVideoPlatform, content: savedVideoUrl, url: savedVideoUrl, date: new Date().toLocaleString() });
      // 立刻落盘：厂商链接 24 小时后失效，等 30 秒定时器就来不及了
      flushAssets();
    } else {
      console.warn('[Video] skip asset save: invalid video url', savedVideoUrl);
    }

  } catch (e) {
    console.error('Video API error:', e);
    var wrapper = document.getElementById('videoResultWrapper');
    var errorMsg = e.message || '未知错误';
    var isPlusLimit = errorMsg.indexOf('usage limit') !== -1 || errorMsg.indexOf('limit reached') !== -1;
    var isHunyuan = selectedVideoModel === 'hunyuan';

    if (isHunyuan) {
      // 混元 API 错误
      wrapper.innerHTML = '<div style="padding:40px;text-align:center;">'
        + '<div style="font-size:48px;margin-bottom:16px;">🎬</div>'
        + '<p style="font-size:15px;color:var(--text-primary);font-weight:600;">腾讯混元视频生成失败</p>'
        + '<p style="font-size:13px;color:var(--text-secondary);margin-top:8px;">' + errorMsg + '</p>'
        + '<button class="btn btn-outline" style="margin-top:16px;font-size:13px;" onclick="exportVideoFallback()">改为导出脚本</button>'
        + '</div>';
    } else if (isPlusLimit) {
      // MiniMax Plus 套餐限制
      wrapper.innerHTML = '<div style="padding:40px;text-align:center;">'
        + '<div style="font-size:48px;margin-bottom:16px;">🎬</div>'
        + '<p style="font-size:15px;color:var(--text-primary);font-weight:600;">Token Plan Plus 不包含视频生成额度</p>'
        + '<p style="font-size:13px;color:var(--text-secondary);margin-top:8px;">你的 Plus 套餐每周视频额度为 0/0，需升级到 Max/Ultra 套餐才能使用视频生成。</p>'
        + '<div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">'
        + '<a href="https://platform.minimaxi.com/user-center/payment/token-plan" target="_blank" style="text-decoration:none;"><button class="btn btn-primary" style="font-size:13px;">升级套餐</button></a>'
        + '<button class="btn btn-outline" style="font-size:13px;" onclick="exportVideoFallback()">导出脚本</button>'
        + '</div></div>';
    } else {
      // MiniMax 其他错误
      wrapper.innerHTML = '<div style="padding:40px;text-align:center;">'
        + '<div style="font-size:48px;margin-bottom:16px;">⚠️</div>'
        + '<p style="font-size:15px;color:var(--text-primary);font-weight:600;">视频生成失败</p>'
        + '<p style="font-size:13px;color:var(--text-secondary);margin-top:8px;">' + errorMsg + '</p>'
        + '<button class="btn btn-outline" style="margin-top:16px;font-size:13px;" onclick="exportVideoFallback()">改为导出脚本</button>'
        + '</div>';
    }

    document.getElementById('btnGenVideo').disabled = false;
    document.getElementById('btnGenVideo').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5,3 19,12 5,21"/></svg> 重新生成视频';
    showToast('⚠️ 视频生成失败: ' + errorMsg);
  }
}

// 分镜成片：拆分镜→逐段生成→展示所有片段
async function generateFullVideo() {
  syncVideoModelFromPicker('video');  // 让下拉框选择驱动旧的状态变量
  var scriptContent = document.getElementById('scriptContent').textContent.trim();
  var title = currentArticle ? currentArticle.title : '';
  var fullText = currentArticle ? currentArticle.content : '';
  if (!fullText && !scriptContent) { showToast('请先生成文章或脚本'); return; }

  var btn = document.getElementById('btnGenFullVideo');
  var btnOrigText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 生成分镜中...';

  try {
    var segments = [];
    if (scriptContent) { segments = parseStoryboard(scriptContent); }

    if (segments.length === 0) {
      btn.innerHTML = '<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> AI生成分镜中...';
      var durationSec = parseInt(document.getElementById('videoDuration').value, 10) || 60;
      if (durationSec < 15) durationSec = 60;
      // 输出格式必须和 parseStoryboard 认的标记严格一致：【分镜N】/ 画面：/ 文案：。
      // 原来这里让模型输出 【Shot N】/Visual/VO，而 parseStoryboard 的正则只认
      // /[【\[]分镜\s*(\d+)/ 和「画面/文案/台词/旁白/字幕」—— 英文分镜一条都
      // 解析不出来，必然走到下面那句 throw '未能解析出分镜'。改中文顺带修掉。
      var systemPrompt = '你是国内短视频平台（抖音 / 快手 / 视频号 / 小红书）的分镜导演。所有输出使用简体中文。视频里的字幕、口播、花字一律中文，不要出现英文。';
      var storyboardPrompt = '根据下面的图文内容，写一条 ' + durationSec + ' 秒的短视频分镜脚本：\n\n' + fullText.slice(0, 3000) + '\n\n要求：\n1. 拆成 6-8 个分镜，每个分镜 8-12 秒\n2. 每个分镜用【分镜N】开头，带时间区间、画面描述、口播文案\n3. 严格按下面的格式输出：\n【分镜1】0-10秒\n画面：XXX\n文案：XXX\n\n【分镜2】10-20秒\n画面：XXX\n文案：XXX\n\n4. 只输出纯文本，不要 markdown 代码块，不要任何额外说明';
      var storyboardText = await callModuleText('video-script', systemPrompt, storyboardPrompt);
      if (!storyboardText) { throw new Error('分镜生成失败，请重试'); }
      document.getElementById('scriptContent').textContent = storyboardText;
      segments = parseStoryboard(storyboardText);
    }

    if (segments.length === 0) { throw new Error('未能解析出分镜，请检查脚本格式（需包含【分镜1】【分镜2】等标记）'); }

    var genVideoModelNames = { hunyuan: '腾讯混元 hy-video-1.5', minimax: 'MiniMax T2V-01', agnes: 'Agnes AI video-v2.0', agnes25: 'Agnes AI Video 2.5', 'seedance-mini': 'Seedance 2 Mini' };
    var genVideoModelName = genVideoModelNames[selectedVideoModel] || 'Seedance 2 Mini';

    // 显示分镜进度
    var wrapper = document.getElementById('videoResultWrapper');
    var progressHtml = '<div style="padding:16px;"><div style="font-size:14px;font-weight:600;margin-bottom:12px;">🎬 分镜成片 · ' + genVideoModelName + '</div><div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">共 ' + segments.length + ' 个分镜，逐段生成中...</div>';
    for (var i = 0; i < segments.length; i++) {
      progressHtml += '<div id="seg-prog-' + i + '" style="margin-bottom:10px;padding:10px 14px;background:var(--bg-tertiary);border-radius:8px;display:flex;align-items:center;gap:10px;">'
        + '<div id="seg-dot-' + i + '" style="width:10px;height:10px;border-radius:50%;background:var(--text-secondary);flex-shrink:0;"></div>'
        + '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">分镜' + (i+1) + '：' + (segments[i].time || '待定') + '</div>'
        + '<div style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (segments[i].visual || '').substring(0,40) + '</div></div>'
        + '<span id="seg-status-' + i + '" style="font-size:11px;color:var(--text-secondary);flex-shrink:0;">等待中</span></div>';
    }
    progressHtml += '</div>';
    wrapper.innerHTML = progressHtml;
    document.getElementById('videoResult').style.display = 'block';
    document.getElementById('videoPreviewArea').style.display = 'none';

    // 逐段生成
    var okVideos = [];
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var dot = document.getElementById('seg-dot-' + i);
      var statusEl = document.getElementById('seg-status-' + i);
      if (dot) { dot.style.background = '#f59e0b'; dot.style.animation = 'pulse 1s infinite'; }
      if (statusEl) statusEl.textContent = '生成中...';

      var segPromptRaw = '短视频片段：' + (seg.visual || '') + '。' + (seg.text || '') + '。专业质感，高清画质，电影级光影。';
      // 追加字幕/口播中文约束（分镜可能被用户手改过）
      var segPrompt = await ensureCnVisualPrompt(segPromptRaw, 'video');
      var segDuration = Math.max(5, Math.min(15, parseInt(seg.duration) || 8));

      try {
        var pc = (function(idx) { return function(poll, maxPoll, status) { var s = document.getElementById('seg-status-' + idx); if (s) s.textContent = '轮询 ' + poll + '/' + maxPoll; }; })(i);
        var vUrl;
        // generateVideo 板块没有参考图功能，传 null
        if (selectedVideoModel === 'hunyuan') { vUrl = await callHunyuanVideo(segPrompt, pc, segDuration, null, null); }
        else if (selectedVideoModel === 'agnes') { vUrl = await callAgnesVideo(segPrompt, pc, segDuration, null, null); }
        else if (selectedVideoModel === 'agnes25') { vUrl = await callAgnesVideo25(segPrompt, pc, segDuration, null, null); }
        else if (selectedVideoModel === 'seedance-mini') { vUrl = await callSeedanceMiniVideo(segPrompt, pc, segDuration, null, null); }
        else { vUrl = await callMiniMaxVideo(segPrompt, pc, segDuration, null, null); }

        if (vUrl) { okVideos.push({ url: vUrl, idx: i, seg: seg }); if (dot) { dot.style.background = '#10b981'; dot.style.animation = ''; } if (statusEl) statusEl.textContent = '✅'; }
        else { if (dot) { dot.style.background = '#ef4444'; dot.style.animation = ''; } if (statusEl) statusEl.textContent = '❌ 失败'; }
      } catch (se) {
        console.error('Segment ' + i + ' error:', se);
        if (dot) { dot.style.background = '#ef4444'; dot.style.animation = ''; }
        if (statusEl) statusEl.textContent = '❌ ' + (se.message || '失败').substring(0,10);
      }
      if (i < segments.length - 1) { await new Promise(function(r) { setTimeout(r, 2000); }); }
    }

    // 渲染结果
    var finalHtml = '<div style="padding:16px;"><div style="font-size:14px;font-weight:600;margin-bottom:8px;">🎬 分镜成片结果（' + okVideos.length + '/' + segments.length + ' 成功）</div>';
    if (okVideos.length === 0) {
      finalHtml += '<div style="padding:40px;text-align:center;color:var(--text-secondary);"><p style="font-size:15px;">⚠️ 所有分镜生成失败</p><p style="font-size:13px;margin-top:8px;">请检查API配置或稍后重试</p></div>';
    } else {
      for (var j = 0; j < okVideos.length; j++) {
        var gv = okVideos[j];
        finalHtml += '<div style="margin-bottom:16px;border:1px solid var(--border-color);border-radius:12px;overflow:hidden;">'
          + '<div style="padding:10px 14px;background:var(--bg-tertiary);font-size:13px;font-weight:500;">分镜' + (gv.idx+1) + '：' + (gv.seg.time || '') + (gv.seg.visual ? ' — ' + gv.seg.visual.substring(0,30) : '') + '</div>'
          + '<video controls autoplay muted playsinline style="width:100%;display:block;max-height:400px;background:#000;"><source src="' + safeUrl(gv.url) + '" type="video/mp4"></video>'
          + '<div style="padding:8px 12px;font-size:11px;color:var(--text-secondary);word-break:break-all;background:var(--bg-secondary);">视频链接：<a href="' + safeUrl(gv.url) + '" target="_blank" style="color:var(--accent-light);">' + escapeHtml(gv.url) + '</a></div></div>';
      }
    }
    finalHtml += '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;"><span style="font-size:12px;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">🤖 ' + genVideoModelName + ' 分镜生成</span><span style="font-size:12px;color:var(--green);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">' + okVideos.length + ' 片段</span></div>';
    wrapper.innerHTML = finalHtml;
    btn.disabled = false;
    btn.textContent = btnOrigText;
    showToast('✅ 分镜成片完成！' + okVideos.length + '/' + segments.length + ' 片段成功');

    // ⚠️ 原来只入库 okVideos[0]，其余分镜片段直接丢掉 —— 用户生成了 5 段，
    // 资产里只有 1 段。现在每段都入库。
    var pushedSeg = 0;
    for (var sv = 0; sv < okVideos.length; sv++) {
      if (!isValidGeneratedMediaUrl(okVideos[sv].url)) continue;
      generatedVideos.push({
        title: (title || '分镜成片') + ' · 片段' + (sv + 1) + '/' + okVideos.length,
        platform: selectedVideoPlatform,
        content: okVideos[sv].url, url: okVideos[sv].url,
        date: new Date().toLocaleString()
      });
      pushedSeg++;
    }
    if (pushedSeg > 0) {
      flushAssets();
    }
  } catch (e) {
    console.error('Full video gen error:', e);
    document.getElementById('videoResultWrapper').innerHTML = '<div style="padding:40px;text-align:center;"><div style="font-size:48px;margin-bottom:16px;">⚠️</div><p style="font-size:15px;color:var(--text-primary);font-weight:600;">分镜成片生成失败</p><p style="font-size:13px;color:var(--text-secondary);margin-top:8px;">' + (e.message || '未知错误') + '</p></div>';
    btn.disabled = false;
    btn.textContent = btnOrigText;
    showToast('⚠️ 分镜成片失败: ' + (e.message || '未知错误'));
  }
}

// 解析分镜脚本文本
function parseStoryboard(scriptText) {
  var segments = [];
  var lines = scriptText.split('\n');
  var current = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var segMatch = line.match(/[【\[]分镜\s*(\d+)[】\]：:]/) || line.match(/^分镜\s*(\d+)[：:]/) || line.match(/^##\s*分镜\s*(\d+)/);
    if (segMatch) {
      if (current) segments.push(current);
      current = { index: parseInt(segMatch[1]), time: '', visual: '', text: '', duration: 8 };
      var tm = line.match(/(\d+)[-~至到](\d+)\s*秒/);
      if (tm) { current.time = tm[1] + '-' + tm[2] + '秒'; current.duration = parseInt(tm[2]) - parseInt(tm[1]); }
    } else if (current) {
      var cl = line.toLowerCase();
      if (cl.indexOf('画面') === 0 || cl.indexOf('画面：') !== -1 || cl.indexOf('视觉') === 0 || cl.indexOf('场景') === 0) {
        current.visual = line.replace(/^(画面|视觉|场景)[：:]\s*/i, '').trim();
      } else if (cl.indexOf('文案') === 0 || cl.indexOf('台词') === 0 || cl.indexOf('旁白') === 0 || cl.indexOf('字幕') === 0) {
        current.text = line.replace(/^(文案|台词|旁白|字幕)[：:]\s*/i, '').trim();
      } else if (cl.indexOf('时间') === 0) {
        var tm2 = line.match(/(\d+)[-~至到](\d+)/);
        if (tm2) { current.time = tm2[1] + '-' + tm2[2] + '秒'; current.duration = parseInt(tm2[2]) - parseInt(tm2[1]); }
      } else if (current.visual) { current.visual += ' ' + line; }
      else { current.visual = line; }
    }
  }
  if (current) segments.push(current);
  return segments;
}

// 导出视频（真实URL直接下载）
function exportVideo() {
  var video = document.querySelector('#videoResultWrapper video');
  if (video && video.querySelector('source')) {
    var src = video.querySelector('source').src;
    if (src && src.indexOf('blob:') === -1 && src.indexOf('about:') === -1) {
      var a = document.createElement('a');
      a.href = src;
      a.download = 'minimax-video.mp4';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('视频下载已开始');
      return;
    }
  }
  exportVideoFallback();
}

// 导出脚本作为视频替代
function exportVideoFallback() {
  var script = document.getElementById('scriptContent').textContent;
  var blob = new Blob([script], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'video-script.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('脚本已导出为文件');
}

// 发布视频：一键跳转至对应国内自媒体平台创作后台，由用户自行登录上传发布
function publishVideo() {
  var video = document.querySelector('#videoResultWrapper video');
  if (video) {
    showToast('请先下载视频文件，平台不支持一键直发，需登录后台手动上传');
  }
  var url = videoPublishUrls[selectedVideoPlatform] || 'https://creator.douyin.com/creator-micro/content/upload';
  var platformName = videoPlatformNames[selectedVideoPlatform] || '抖音';
  showToast('正在打开 ' + platformName + ' 上传后台，请登录后自行上传视频…');
  setTimeout(function() { window.open(url, '_blank', 'noopener'); }, 800);
}

// ============ ACCOUNT MANAGEMENT ============
// 七个国内主流自媒体平台。键名和站内其他地方保持同一套拼音写法
// （videoPublishUrls / platformPublishUrls / 棘手回复的平台调性都用
// douyin / xiaohongshu / kuaishou / shipinhao 这一套），别在这里另起一套，
// 否则以后想把"绑定的账号"和"发布入口"打通会先卡在键名对不上。
var platformAccountStore = {
  douyin: '抖音', xiaohongshu: '小红书', kuaishou: '快手', shipinhao: '微信视频号',
  gongzhonghao: '微信公众号', toutiao: '今日头条', bilibili: 'B站'
};
// 品牌色都取各平台自己的主色，且刻意避开纯黑 —— 头像块是
// `background: platformColors[...]`，深色底上放纯黑等于头像消失。
var platformColors = {
  douyin: '#FE2C55', xiaohongshu: '#FF2442', kuaishou: '#FF6E00', shipinhao: '#07C160',
  gongzhonghao: '#576B95', toutiao: '#F04142', bilibili: '#FB7299'
};
var platformIcons = {
  douyin: '🎵', xiaohongshu: '📕', kuaishou: '⚡', shipinhao: '🎬',
  gongzhonghao: '💬', toutiao: '📰', bilibili: '📺'
};

// 视频类平台 vs 图文类平台 —— 只影响"播放量/阅读量"这个标签文案。
// 原来这个判断在 renderAccounts 和 openDashboard 里各写了一份数组，
// 而且两份内容不一样（一份还是海外键名），同一个账号在卡片上显示"阅读量"、
// 点开弹窗显示"播放量"。抽成一处，两边都调这里。
var VIDEO_ACCOUNT_PLATFORMS = ['douyin', 'kuaishou', 'shipinhao', 'bilibili'];
function isVideoAccountPlatform(plat) {
  return VIDEO_ACCOUNT_PLATFORMS.indexOf(plat) !== -1;
}

// 海外版遗留键名 → 国内平台。老用户库里已经存着 platform:'instagram'
// 这类记录，新字典查不到就是 background:undefined + 空图标，卡片直接烂掉。
// 按"内容形态最接近"来对：图文种草→小红书、短视频→抖音、中长视频→B站、
// 公私域长文→公众号、资讯分发→今日头条。
var LEGACY_PLATFORM_MAP = {
  instagram: 'xiaohongshu', pinterest: 'xiaohongshu', tiktok: 'douyin',
  youtube: 'bilibili', facebook: 'gongzhonghao', linkedin: 'gongzhonghao',
  twitter: 'toutiao'
};

// 迁移用的中文昵称池。和绑定流程里的 nickPool 分开维护：
// 那个是"新绑定时随机取一个"，这个是"给旧记录补一个"，
// 两处撞名反而容易让人以为是同一个账号，故意用不同的词。
var LEGACY_RENAME_POOL = {
  douyin:       ['短视频运营号', '好物开箱号', '日常种草号'],
  xiaohongshu:  ['笔记种草号', '好物清单号', '生活分享号'],
  kuaishou:     ['老铁好物号', '产业带直供号', '实测推荐号'],
  shipinhao:    ['私域转化号', '认真选物号', '生活提案号'],
  gongzhonghao: ['品牌内容号', '深度长文号', '运营手记号'],
  toutiao:      ['资讯分发号', '消费观察号', '好物情报号'],
  bilibili:     ['测评视频号', '拆机日常号', '知识分享号']
};

// 判断一个账号名是不是海外遗留：不含任何中日韩字符就算。
// 用这条而不是去匹配 '@brand.ig' / 'Brand Channel' 这些具体前缀 ——
// 海外版那张 handlePrefix 表有 7 种写法，逐个列一定会漏；
// 反过来，国内版生成的名字必然带中文，这条判据更稳。
function isLegacyAccountName(name) {
  return !!name && !/[\u4e00-\u9fa5\u3040-\u30ff]/.test(name);
}

// 稳定重命名：拿 accountId 的字符和当种子，同一条记录每次都得到同一个名字。
// 不能用 Math.random() —— loadAccounts() 每次调用都会重跑迁移，
// 随机的话用户刷一次页面账号就换一次名字，saveAccounts 还会把它写回后端。
function legacyRenameFor(plat, seedStr) {
  var pool = LEGACY_RENAME_POOL[plat] || ['自媒体账号'];
  var sum = 0;
  var s = String(seedStr || '');
  for (var i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return pool[sum % pool.length] + (1000 + (sum % 9000));
}

var boundAccounts = loadAccounts();
var selectedBindPlatform = null;
var bindCountdownTimer = null;

// 社媒账号（仅管理员用）：缓存 + 后端持久化
window._accountsCache = [];
function loadAccounts() {
  var list = window._accountsCache || [];
  // 就地迁移旧平台键。放在这里而不是渲染处：所有读账号的路径都过 loadAccounts，
  // 迁一次就够；渲染层再兜底就得每个用到 platform 的地方都写一遍。
  for (var i = 0; i < list.length; i++) {
    if (!list[i]) continue;
    var p = list[i].platform;
    if (p && LEGACY_PLATFORM_MAP[p]) list[i].platform = LEGACY_PLATFORM_MAP[p];
    // 迁移表也认不出来的（手改过库/更早的版本），统一落到抖音，
    // 不留 undefined —— 宁可平台标错，也不要一张渲染不出来的卡片。
    if (!platformAccountStore[list[i].platform]) list[i].platform = 'douyin';

    // 名字和 ID 也要一起迁。只换 platform 的话卡片会长成
    // 「🎵 @brand.tt_106 · 抖音 · acct_tiktok_ms47tqqy」——
    // 中文平台标签配英文 handle，比不迁移更像系统在乱填数据。
    if (isLegacyAccountName(list[i].accountName)) {
      list[i].accountName = legacyRenameFor(list[i].platform, list[i].accountId || list[i].id);
      // 评论是按账号名生成的，名字换了就重新生成一遍，否则弹窗里
      // 还挂着旧名字的@提及。
      if (typeof generateMockComments === 'function') {
        try { list[i].comments = generateMockComments(list[i].accountName); } catch (e) {}
      }
    }
    // accountId 里的平台名同样要跟着换（卡片副标题直接显示这个字段）
    if (typeof list[i].accountId === 'string') {
      var legacyKeys = Object.keys(LEGACY_PLATFORM_MAP);
      for (var k = 0; k < legacyKeys.length; k++) {
        if (list[i].accountId.indexOf(legacyKeys[k]) !== -1) {
          list[i].accountId = list[i].accountId.replace(legacyKeys[k], list[i].platform);
          break;
        }
      }
    }
  }
  return list;
}

// 首次进入自动 seed 三个示例账号（抖音 / 小红书 / 公众号），
// 覆盖"短视频 + 图文种草 + 长文私域"三种形态，让账号管理一进来就有东西看。
// 标记写在 localStorage 而不是后端：这是纯演示数据，不是业务数据；
// 而且后端 GET 返回空数组时分不清"从没存过"和"用户自己解绑清空了" ——
// 没有这个标记，用户手动解绑到 0 之后一刷新就又被塞回三个账号。
function seedDemoAccountsIfNeeded() {
  if (!window.currentUser) return;
  var key = 'gs_acct_seeded_' + window.currentUser.username;
  try { if (localStorage.getItem(key)) return; } catch (e) { return; }
  if (boundAccounts.length > 0) {
    try { localStorage.setItem(key, '1'); } catch (e) {}
    return;
  }
  var seeds = [
    { platform: 'douyin',       accountName: '好物研究所0421' },
    { platform: 'xiaohongshu',  accountName: '小林选物笔记' },
    { platform: 'gongzhonghao', accountName: '内容运营观察' }
  ];
  for (var i = 0; i < seeds.length; i++) {
    boundAccounts.push({
      id: 'acct_seed_' + i + '_' + Date.now(),
      platform: seeds[i].platform,
      accountName: seeds[i].accountName,
      accountId: 'acct_' + seeds[i].platform + '_demo' + (i + 1),
      boundAt: Date.now() - (i + 1) * 86400000 * 12,
      stats: generateMockStats(),
      comments: generateMockComments(seeds[i].accountName)
    });
  }
  saveAccounts();
  try { localStorage.setItem(key, '1'); } catch (e) {}
}

function saveAccounts() {
  window._accountsCache = boundAccounts;
  if (window.currentUser) {
    fetch('/api/data/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accounts: boundAccounts })
    }).catch(function(e) {});
  }
}

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateMockStats() {
  var likes = randomInt(1200, 85000);
  var comments = randomInt(80, 12000);
  var shares = randomInt(30, 15000);
  var views = randomInt(likes * 5, likes * 50);
  return {
    totalLikes: likes, totalComments: comments, totalShares: shares, totalViews: views,
    totalPosts: randomInt(5, 200),
    recent30Likes: randomInt(100, 5000), recent30Comments: randomInt(10, 800),
    recent30Shares: randomInt(5, 600), recent30Views: randomInt(500, 25000),
    weeklyGrowth: (Math.random() * 40 - 5).toFixed(1)
  };
}

function generateMockComments(acctName) {
  var users = ['科技观察者', '内容创作者小王', 'AI爱好者', '自媒体运营Lee', '数据分析师张',
    '短视频达人', '行业洞察者', '新媒探索者', '数字游民', '创意工坊'];
  var texts = [
    '分析得太到位了！学到了很多', '这个观点我很认同，期待下一期', '请问能出一期关于新手入门的教程吗？',
    '已经收藏转发了，非常实用', '数据很扎实，点赞支持', '干货满满，感谢分享',
    '有个问题请教一下：如何提升前3秒的完播率？', '实操建议很有价值，马上试试',
    '坚持日更多久了？想知道你的更新频率', '这个角度很新颖，值得借鉴'
  ];
  var articles = ['深度解析AI行业趋势', '短视频爆款方法论', '2026内容创作指南',
    '从0开始做自媒体', '小红书涨粉攻略', '抖音算法揭秘', '公众号写作技巧'];
  var comments = [];
  var count = randomInt(3, 8);
  for (var i = 0; i < count; i++) {
    comments.push({
      id: 'c' + Date.now() + '_' + i,
      user: users[Math.floor(Math.random() * users.length)],
      content: texts[Math.floor(Math.random() * texts.length)],
      articleTitle: articles[Math.floor(Math.random() * articles.length)],
      time: new Date(Date.now() - randomInt(1, 72) * 3600000).toLocaleString(),
      replied: false, replyContent: ''
    });
  }
  return comments;
}

// ===== Accounts Section Rendering =====
function renderAccounts() {
  var grid = document.getElementById('accountGrid');
  var empty = document.getElementById('accountsEmpty');
  var badge = document.getElementById('nav-account-badge');

  if (boundAccounts.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    badge.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  badge.style.display = 'inline-block';
  badge.textContent = boundAccounts.length;

  var html = '';
  boundAccounts.forEach(function(acct, idx) {
    var s = acct.stats;
    var isVideoPlatform = isVideoAccountPlatform(acct.platform);
    html += '<div class="acct-card animate-slide-up" style="animation-delay:' + (idx*0.05) + 's;" onclick="openDashboard(\'' + acct.id + '\')">'
      + '<button class="acct-unbind" title="解绑" onclick="event.stopPropagation();unbindAccount(\'' + acct.id + '\')">✕</button>'
      + '<div class="acct-card-header">'
      + '<div class="acct-avatar" style="background:' + platformColors[acct.platform] + '">' + platformIcons[acct.platform] + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(acct.accountName) + '</div>'
      + '<div style="font-size:12px;color:var(--text-secondary);">' + platformAccountStore[acct.platform] + ' · ' + escapeHtml(acct.accountId) + '</div>'
      + '</div></div>'
      + '<div class="acct-stats-row">'
      + '<div class="acct-stat"><div class="acct-stat-val">' + fmtNum(s.totalLikes) + '</div><div class="acct-stat-lbl">👍 点赞</div></div>'
      + '<div class="acct-stat"><div class="acct-stat-val">' + fmtNum(s.totalComments) + '</div><div class="acct-stat-lbl">💬 评论</div></div>'
      + '<div class="acct-stat"><div class="acct-stat-val">' + fmtNum(s.totalShares) + '</div><div class="acct-stat-lbl">🔄 转发</div></div>'
      + '<div class="acct-stat"><div class="acct-stat-val">' + fmtNum(s.totalViews) + '</div><div class="acct-stat-lbl">👁 ' + (isVideoPlatform ? '播放量' : '阅读量') + '</div></div>'
      + '<div class="acct-stat"><div class="acct-stat-val">' + fmtNum(s.totalPosts) + '</div><div class="acct-stat-lbl">📂 作品数</div></div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-secondary);margin-top:10px;text-align:center;">'
      + '绑定于 ' + new Date(acct.boundAt).toLocaleDateString() + ' · ' + s.totalPosts + ' 篇内容'
      + '</div></div>';
  });
  grid.innerHTML = html;
}

function fmtNum(n) {
  // 中文界面就写「万」。原来 >=10000 输出 '1.2w'、1000-9999 输出 '5.4k' ——
  // 前者是海外化写法，后者中文里根本没人这么读（"五点四千"？），
  // 四位数直接给原始数字反而更清楚。
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toString();
}

// ===== Bind Modal =====
function openBindModal() {
  selectedBindPlatform = null;
  document.querySelectorAll('.platform-option').forEach(function(el) { el.classList.remove('selected'); });
  document.getElementById('bindModal').style.display = 'flex';
  document.getElementById('bindStep1').style.display = 'block';
  document.getElementById('bindStep3').style.display = 'none';
  document.getElementById('btnBindNext1').disabled = true;
  setBindStep(1);
  if (bindCountdownTimer) { clearInterval(bindCountdownTimer); bindCountdownTimer = null; }
}

function closeBindModal() {
  document.getElementById('bindModal').style.display = 'none';
  if (bindCountdownTimer) { clearInterval(bindCountdownTimer); bindCountdownTimer = null; }
}

function setBindStep(n) {
  // 简化：只有2步，bs1=选择平台, bs3=扫码绑定
  if (n === 1) {
    document.getElementById('bs1').classList.add('active');
    document.getElementById('bs3').classList.remove('active');
  } else {
    document.getElementById('bs1').classList.remove('active');
    document.getElementById('bs3').classList.add('active');
  }
}

function selectBindPlatform(plat, el) {
  document.querySelectorAll('.platform-option').forEach(function(e) { e.classList.remove('selected'); });
  el.classList.add('selected');
  selectedBindPlatform = plat;
  document.getElementById('btnBindNext1').disabled = false;
}

function goBindStep1() {
  document.getElementById('bindStep1').style.display = 'block';
  document.getElementById('bindStep3').style.display = 'none';
  setBindStep(1);
  if (bindCountdownTimer) { clearInterval(bindCountdownTimer); bindCountdownTimer = null; }
}

// 选好平台后直接到扫码步骤（自动生成账号信息）
function goBindStep3() {
  if (!selectedBindPlatform) return;

  // 生成国内风格账号名。海外版这里是 '@brand.ig' / 'Brand Channel' 这类 handle，
  // 国内平台用的是中文昵称，带数字后缀（重名太多，平台自己也这么建议）。
  // 每个平台三个候选，随机取一个 —— 连点三次绑定不会拿到三个一样的名字。
  var nickPool = {
    douyin:       ['好物研究所', '选品日记', '开箱小分队'],
    xiaohongshu:  ['小林选物笔记', '日常好物清单', '一只种草机'],
    kuaishou:     ['老铁好物', '产业带直供', '实测不吹牛'],
    shipinhao:    ['家用好物指南', '认真选物', '生活提案'],
    gongzhonghao: ['内容运营观察', '选品笔记本', '自媒体手记'],
    toutiao:      ['消费观察室', '好物情报站', '数码看点'],
    bilibili:     ['测评小实验室', '数码拆机日常', '好物真香警告']
  };
  var pool = nickPool[selectedBindPlatform] || ['自媒体账号'];
  var suffix = Math.floor(Math.random() * 9000 + 1000);  // 4 位，和国内昵称习惯一致
  var autoName = pool[Math.floor(Math.random() * pool.length)] + suffix;
  var autoId = 'acct_' + selectedBindPlatform + '_' + Date.now().toString(36);
  window._bindAutoName = autoName;
  window._bindAutoId = autoId;

  document.getElementById('bindStep1').style.display = 'none';
  document.getElementById('bindStep3').style.display = 'block';
  setBindStep(2);

  // 生成模拟 OAuth 二维码（本地画一个 SVG，不外联 qrserver 避免出海延迟）
  var container = document.getElementById('qrContainer');
  var brandColor = (typeof platformColors !== 'undefined' && platformColors[selectedBindPlatform]) || '#6366f1';
  container.innerHTML = ''
    + '<div style="width:180px;height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:' + brandColor + ';">'
    + '<div style="font-size:64px;line-height:1;margin-bottom:8px;">' + (platformIcons[selectedBindPlatform] || '🔗') + '</div>'
    + '<div style="font-size:13px;font-weight:600;color:#111;">' + platformAccountStore[selectedBindPlatform] + '</div>'
    + '<div style="font-size:11px;color:#555;margin-top:4px;">模拟扫码授权</div>'
    + '</div>';

  var isEn = (window.currentLang === 'en');
  document.getElementById('qrPlatformLabel').textContent = isEn
    ? 'Simulated OAuth 2.0 authorization for ' + platformAccountStore[selectedBindPlatform] + ' — this is a demo mock, no real account is bound.'
    : '模拟 ' + platformAccountStore[selectedBindPlatform] + ' OAuth 2.0 授权（演示用，不会真的连接到你的账号）';
  document.getElementById('qrAutoName').textContent = autoName;

  document.getElementById('btnBindComplete').disabled = false;
  document.getElementById('btnBindComplete').textContent = isEn ? 'Complete mock binding' : '完成模拟绑定';
  document.getElementById('btnBindComplete').style.opacity = '1';
  document.getElementById('btnBindComplete').onclick = function() { completeBind(); };

  document.getElementById('qrCountdown').textContent = isEn
    ? 'Click the button below to complete the mock binding'
    : '点击下方按钮完成模拟绑定';
}

function completeBind() {
  var name = window._bindAutoName;
  var acctId = window._bindAutoId;
  if (!name || !acctId) return;

  var account = {
    id: 'acct_' + Date.now(),
    platform: selectedBindPlatform,
    accountName: name,
    accountId: acctId,
    boundAt: Date.now(),
    stats: generateMockStats(),
    comments: generateMockComments(name)
  };
  boundAccounts.unshift(account);
  saveAccounts();
  renderAccounts();
  closeBindModal();
  var isEn = (window.currentLang === 'en');
  showToast(isEn
    ? ('✅ Mock-bound ' + platformAccountStore[selectedBindPlatform] + ': ' + name)
    : ('✅ 已模拟绑定 ' + platformAccountStore[selectedBindPlatform] + '：' + name));
}

// ===== Unbind =====
function unbindAccount(acctId) {
  var acct = boundAccounts.find(function(a) { return a.id === acctId; });
  if (!acct) return;
  var isEn = (window.currentLang === 'en');
  var confirmMsg = isEn
    ? ('Unbind "' + acct.accountName + '" (' + platformAccountStore[acct.platform] + ')?\n\nData will disappear from this dashboard. The real platform account is not affected.')
    : ('确定要解绑「' + acct.accountName + '」（' + platformAccountStore[acct.platform] + '）吗？\n\n解绑后数据将不再显示，但不会删除平台上的实际数据。');
  if (!confirm(confirmMsg)) return;
  boundAccounts = boundAccounts.filter(function(a) { return a.id !== acctId; });
  saveAccounts();
  renderAccounts();
  showToast(isEn ? ('Unbound ' + acct.accountName) : ('已解绑 ' + acct.accountName));
}

// ===== Dashboard =====
var currentDashboardAccount = null;

function openDashboard(acctId) {
  var acct = boundAccounts.find(function(a) { return a.id === acctId; });
  if (!acct) return;
  currentDashboardAccount = acct;
  var s = acct.stats;

  document.getElementById('dashboardModal').style.display = 'flex';
  document.getElementById('dashAvatar').textContent = platformIcons[acct.platform];
  document.getElementById('dashAvatar').style.background = platformColors[acct.platform];
  document.getElementById('dashName').textContent = acct.accountName;
  document.getElementById('dashPlatform').textContent = platformAccountStore[acct.platform] + ' · ' + acct.accountId;

  // 播放量/阅读量标签：视频平台用"播放量"，图文平台用"阅读量"（与卡片同一判定）
  var isVideoPlatform = isVideoAccountPlatform(acct.platform);
  document.getElementById('dashViewsLabel').textContent = isVideoPlatform ? '👁 播放量' : '👁 阅读量';

  document.getElementById('dashLikes').textContent = fmtNum(s.totalLikes);
  document.getElementById('dashComments').textContent = fmtNum(s.totalComments);
  document.getElementById('dashShares').textContent = fmtNum(s.totalShares);
  document.getElementById('dashViews').textContent = fmtNum(s.totalViews);
  document.getElementById('dashWorks').textContent = fmtNum(s.totalPosts);

  var growClass = parseFloat(s.weeklyGrowth) >= 0 ? 'dash-growth' : 'dash-decline';
  var growSign = parseFloat(s.weeklyGrowth) >= 0 ? '+' : '';
  var growHtml = '<span class="' + growClass + '">' + growSign + s.weeklyGrowth + '% 本周</span>';

  document.getElementById('dashLikesGrowth').innerHTML = growHtml;
  document.getElementById('dashCommentsGrowth').innerHTML = growHtml;
  document.getElementById('dashSharesGrowth').innerHTML = growHtml;
  document.getElementById('dashViewsGrowth').innerHTML = growHtml;

  document.getElementById('dashCommentCount').textContent = acct.comments.length + ' 条评论';
  renderComments();
}

function closeDashboard() {
  document.getElementById('dashboardModal').style.display = 'none';
  currentDashboardAccount = null;
}

function renderComments() {
  if (!currentDashboardAccount) return;
  var list = document.getElementById('commentList');
  var comments = currentDashboardAccount.comments;
  if (comments.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px;">暂无评论</p>';
    return;
  }
  var html = '';
  comments.forEach(function(c) {
    var initial = c.user.charAt(0);
    html += '<div class="comment-item">'
      + '<div class="comment-avatar">' + initial + '</div>'
      + '<div class="comment-body">'
      + '<div class="comment-user">' + escapeHtml(c.user) + (c.replied ? ' <span class="reply-sent">✅ 已回复</span>' : '') + '</div>'
      + '<div class="comment-text">' + escapeHtml(c.content) + '</div>'
      + '<div class="comment-meta">'
      + '<span>📄 ' + escapeHtml(c.articleTitle) + '</span>'
      + '<span>' + c.time + '</span>'
      + '</div>';
    if (c.replied && c.replyContent) {
      html += '<div style="margin-top:6px;padding:8px 12px;background:var(--bg-secondary);border-radius:8px;font-size:12px;color:var(--accent-light);">'
        + '🤖 你的回复：' + escapeHtml(c.replyContent) + '</div>';
    }
    if (!c.replied) {
      html += '<div class="comment-reply-area">'
        + '<input class="comment-reply-input" id="replyInput_' + c.id + '" placeholder="输入回复内容..." onkeydown="if(event.key===\'Enter\')replyComment(\'' + c.id + '\')">'
        + '<button class="btn btn-primary btn-sm" onclick="replyComment(\'' + c.id + '\')" style="padding:6px 14px;font-size:12px;">回复</button>'
        + '</div>';
    }
    html += '</div></div>';
  });
  list.innerHTML = html;
}

function replyComment(commentId) {
  if (!currentDashboardAccount) return;
  var input = document.getElementById('replyInput_' + commentId);
  if (!input) return;
  var text = input.value.trim();
  if (!text) { showToast('请输入回复内容'); return; }

  var comment = currentDashboardAccount.comments.find(function(c) { return c.id === commentId; });
  if (comment) {
    comment.replied = true;
    comment.replyContent = text;
  }
  saveAccounts();
  renderComments();
  showToast('✅ 已回复评论');
}

// ============ TOAST ============
function showToast(msg, duration) {
  var container = document.getElementById('toastContainer');
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  var d = duration || 2500;
  setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s ease'; }, d);
  setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, d + 500);
}

// ============ 访客IP统计 ============
var ipStatsData = [];          // 所有IP记录
var sessionStartTime = Date.now();  // 本次会话开始时间
var ipUpdateTimer = null;      // 定时器
var currentVisitorIP = '';     // 当前访问者IP

// 检测操作系统
function detectOS() {
  var ua = navigator.userAgent;
  if (ua.indexOf('Windows NT') !== -1) {
    var v = ua.match(/Windows NT (\d+\.\d+)/);
    var ver = v ? v[1] : '';
    if (ver === '10.0') return { name: 'Windows 10/11', cls: 'windows' };
    return { name: 'Windows', cls: 'windows' };
  }
  if (ua.indexOf('Mac OS X') !== -1) return { name: 'macOS', cls: 'macos' };
  if (ua.indexOf('Linux') !== -1 && ua.indexOf('Android') === -1) return { name: 'Linux', cls: 'linux' };
  if (ua.indexOf('Android') !== -1) return { name: 'Android', cls: 'android' };
  if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) return { name: 'iOS', cls: 'ios' };
  return { name: '未知', cls: '' };
}

// 加载已存储的IP记录（仅管理员，全局，走 /api/ip_stats）
async function loadIPStats() {
  if (!window.currentUser || window.currentUser.role !== 'admin') { ipStatsData = []; return; }
  try {
    var resp = await fetch('/api/ip_stats');
    var d = await resp.json();
    ipStatsData = (d && d.success && Array.isArray(d.stats)) ? d.stats : [];
  } catch (e) {
    ipStatsData = [];
  }
}

// 保存IP记录（仅管理员）
function saveIPStats() {
  if (!window.currentUser || window.currentUser.role !== 'admin') return;
  fetch('/api/ip_stats', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stats: ipStatsData.slice(-200) })
  }).catch(function(e) {});
}

// 格式化持续时间
function formatDuration(seconds) {
  if (seconds < 60) return seconds + '秒';
  if (seconds < 3600) return Math.floor(seconds / 60) + '分钟';
  return Math.floor(seconds / 3600) + '小时' + Math.floor((seconds % 3600) / 60) + '分钟';
}

// 记录或更新IP访问
function recordIPVisit(ip, ipLocation) {
  var now = new Date();
  var nowStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  var osInfo = detectOS();
  var found = false;

  for (var i = 0; i < ipStatsData.length; i++) {
    if (ipStatsData[i].ip === ip) {
      found = true;
      ipStatsData[i].lastActive = nowStr;
      ipStatsData[i].lastActiveTs = Date.now();
      ipStatsData[i].visitCount = (ipStatsData[i].visitCount || 1) + 1;
      ipStatsData[i].os = osInfo.name;
      ipStatsData[i].osCls = osInfo.cls;
      if (ipLocation) ipStatsData[i].ipLocation = ipLocation;
      break;
    }
  }

  if (!found) {
    ipStatsData.push({
      ip: ip,
      visitType: '访问',
      ipLocation: ipLocation || '未知',
      firstVisit: nowStr,
      lastActive: nowStr,
      lastActiveTs: Date.now(),
      durationSeconds: 0,
      os: osInfo.name,
      osCls: osInfo.cls,
      visitCount: 1
    });
  }

  saveIPStats();
}

// 更新当前会话的持续时间
function updateSessionDuration() {
  if (!currentVisitorIP) return;
  var elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  for (var i = 0; i < ipStatsData.length; i++) {
    if (ipStatsData[i].ip === currentVisitorIP) {
      ipStatsData[i].durationSeconds = Math.max(ipStatsData[i].durationSeconds || 0, elapsed);
      ipStatsData[i].lastActiveTs = Date.now();
      break;
    }
  }
  saveIPStats();
}

// 标记为"使用"（用户有交互时调用）
function markIPUsage() {
  if (!currentVisitorIP) return;
  for (var i = 0; i < ipStatsData.length; i++) {
    if (ipStatsData[i].ip === currentVisitorIP) {
      ipStatsData[i].visitType = '使用';
      break;
    }
  }
}

// 获取当前客户端IP（使用免费API）
function fetchClientIP() {
  // 优先使用 ip-api.com（免费、无需key、支持CORS）
  fetch('http://ip-api.com/json/?fields=query,country,city,isp')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.query) {
        currentVisitorIP = data.query;
        var location = (data.city || '') + (data.city && data.country ? ', ' : '') + (data.country || '');
        if (data.isp && data.isp !== data.query) {
          location = location || data.isp;
        }
        if (!location) location = '未知';
        recordIPVisit(data.query, location);
        renderIPStats();
      }
    })
    .catch(function() {
      // 备用：使用 ipapi.co
      fetch('https://ipapi.co/json/')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.ip) {
            currentVisitorIP = data.ip;
            var loc = (data.city || '') + (data.city && data.country_name ? ', ' : '') + (data.country_name || '');
            if (!loc) loc = '未知';
            recordIPVisit(data.ip, loc);
            renderIPStats();
          }
        })
        .catch(function() {
          // 离线/本地：使用占位IP
          currentVisitorIP = '本地访问';
          recordIPVisit('本地访问', '本地环境');
          renderIPStats();
        });
    });
}

// 渲染IP统计概览卡片
function renderIPSummary() {
  var container = document.getElementById('ipStatsSummary');
  if (!container) return;

  var totalIPs = ipStatsData.length;
  var activeIPs = 0;
  var last30min = Date.now() - 30 * 60 * 1000;

  for (var i = 0; i < ipStatsData.length; i++) {
    if ((ipStatsData[i].lastActiveTs || 0) > last30min) activeIPs++;
  }

  container.innerHTML =
    '<div class="ip-stat-card">' +
      '<div class="val">' + totalIPs + '</div>' +
      '<div class="lbl">📊 累计访问IP数</div>' +
    '</div>' +
    '<div class="ip-stat-card">' +
      '<div class="val">' + activeIPs + '</div>' +
      '<div class="lbl">🟢 近30分钟活跃</div>' +
    '</div>' +
    '<div class="ip-stat-card">' +
      '<div class="val">' + (currentVisitorIP || '获取中...') + '</div>' +
      '<div class="lbl">📌 当前客户端IP</div>' +
    '</div>';
}

// 渲染IP统计表格
function renderIPStatsTable() {
  var tbody = document.getElementById('ipStatsTbody');
  if (!tbody) return;

  if (ipStatsData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-secondary);">📡 暂无访客数据</td></tr>';
    return;
  }

  // 按最近活跃时间倒序
  var sorted = ipStatsData.slice().sort(function(a, b) {
    return (b.lastActiveTs || 0) - (a.lastActiveTs || 0);
  });

  var html = '';
  for (var i = 0; i < sorted.length; i++) {
    var r = sorted[i];
    var osBadge = r.osCls ? '<span class="os-badge ' + r.osCls + '">' + (r.os || '未知') + '</span>' : (r.os || '未知');
    html += '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td style="font-family:monospace;color:var(--accent-light);">' + r.ip + '</td>' +
      '<td>' + (r.visitType === '使用' ? '🟢 使用' : '🔵 访问') + '</td>' +
      '<td>' + (r.ipLocation || '未知') + '</td>' +
      '<td>' + (r.firstVisit || '-') + '</td>' +
      '<td>' + (r.lastActive || '-') + '</td>' +
      '<td>' + formatDuration(r.durationSeconds || 0) + '</td>' +
      '<td>' + osBadge + '</td>' +
      '<td>' + (r.visitCount || 1) + ' 次</td>' +
      '</tr>';
  }
  tbody.innerHTML = html;
}

// 渲染全部IP统计
function renderIPStats() {
  renderIPSummary();
  renderIPStatsTable();
}

// 清空IP统计记录
function clearIPStats() {
  if (!confirm('确定要清空所有访客IP统计记录吗？此操作不可恢复！')) return;
  ipStatsData = [];
  saveIPStats();
  renderIPStats();
  showToast('🗑️ 访客IP统计记录已清空');
}

// 监听用户交互，标记为"使用"
function setupIPUsageTracking() {
  var events = ['click', 'keydown', 'scroll', 'input'];
  var markFn = function() {
    markIPUsage();
    // 只标记一次
    for (var i = 0; i < events.length; i++) {
      document.removeEventListener(events[i], markFn);
    }
  };
  for (var i = 0; i < events.length; i++) {
    document.addEventListener(events[i], markFn, { once: true });
  }
}

// 初始化IP统计
function initIPStats() {
  // 访客统计仅管理员可见/记录
  if (!window.currentUser || window.currentUser.role !== 'admin') return;
  loadIPStats();
  fetchClientIP();
  // 每30秒更新持续时间
  ipUpdateTimer = setInterval(function() {
    updateSessionDuration();
    renderIPStats();
  }, 30000);
  setupIPUsageTracking();
}

// ============ STARTUP ============

// ====================== 视频创作（独立页） ======================
// 注意：vcSelectedModel 已在文件前部（视频模型配置区）声明，这里不能再 var 一次，
// 否则页面加载到此处会把 picker 同步过来的选择重置回 'seedance-mini'（用户报的 Bug #6）。
var vcRefImageDataUrl = null;

function vcSelectModel(model, el) {
  vcSelectedModel = model;
  document.querySelectorAll('#vcModelChips .video-model-chip').forEach(function(c) {
    c.classList.remove('active');
    c.style.background = 'transparent';
    c.style.color = 'var(--text-secondary)';
  });
  if (el) {
    el.classList.add('active');
    el.style.background = 'var(--accent-glow)';
    el.style.color = 'var(--accent-light)';
  }
}

// 视频热词与 imageHotPrompts 同一批题材（用户要求两处可以一致），
// 但写法不同：图片写"一帧画面"，视频必须写**动作 + 镜头运动 + 节奏**，
// 否则文生视频模型只会给一段几乎静止的画面。
// 默认 9:16 竖屏 —— 抖音/快手/视频号/小红书的主力版式，横屏进去要被裁。
// 字幕/口播的中文约束由 ensureCnVisualPrompt() 统一追加，这里不重复写。
var videoHotPrompts = [
  // 1. 开箱测评
  '快节奏开箱短视频：一双手拆开牛皮纸快递箱，抽出一台深灰色无线耳机，快速切到充电盒开合、耳塞细节的微距特写，再切到试戴后满意点头的反应镜头，手持轻微晃动，明亮自然光，节奏干脆，9:16 竖屏',
  // 2. 美食探店
  '美食探店短视频：镜头跟随推开街边小店的门帘，砂锅端上桌红油翻滚热气腾腾，微距推近夹起一块牛肉的拉丝瞬间，再切到食客入口后眯眼的表情，暖色调，手持跟拍，深色木桌与暗调店内环境，9:16 竖屏',
  // 3. 美妆试色
  '美妆试色短视频：亚洲年轻女性对镜涂抹口红，特写唇部上色前后的对比，镜头缓慢环绕到侧脸展示妆感，指尖蘸取精华轻拍脸颊的慢动作，窗边柔和自然光，皮肤纹理真实不过度磨皮，通透干净，9:16 竖屏',
  // 4. 型男穿搭
  '型男穿搭短视频：亚洲男性在城市老街骑楼下走向镜头，工装夹克随步伐摆动，快速切到鞋面、袖口、腰带的细节特写，再切到转身回头的定格，傍晚侧逆光带轮廓光，35mm 街头跟拍，轻胶片颗粒，杂志感，9:16 竖屏',
  // 5. 旅游 vlog
  '旅游 vlog 短视频：清晨川西高原公路，背包旅行者背对镜头向前走，镜头低角度跟随拉升露出远处雪山，切到晨雾中流云延时，再切到回头微笑的手持特写，冷蓝调加暖阳光斑，体积光，电影级调色，9:16 竖屏',
  // 6. 数码实测
  '数码实测短视频：一台无线降噪耳机放在岩板桌面，镜头贴桌面横移展示机身，切到戴上耳机后周围环境声消失的视觉表现（背景人流虚化变暗），再切到手指按压触控区的微距，冷白顶光加蓝色补光，科技感强，9:16 竖屏',
  // 7. 社媒广告
  '社媒信息流广告短视频：亚洲女性在明亮客厅用手持挂烫机抚平衬衫褶皱，褶皱在蒸汽中消失的近景慢动作，快速切到衣柜前满意整理衣领的镜头，高饱和撞色背景，浅景深，前三秒必须出现最直观的效果对比，9:16 竖屏',
  // 8. 素人种草
  '素人真实种草短视频：普通女生在出租屋卫生间镜前对着手机自拍讲话，随手挤出身体乳涂抹手臂，画面有轻微晃动和自动对焦呼吸，顶灯与窗光混合的偏黄光线，瓷砖和杂物都在画面里不做美化，毫无棚拍痕迹，9:16 竖屏',
  // 9. 直播预告
  '直播预告短视频：主播在明亮直播间对镜头挥手，身后堆满家居小电与礼盒，快速蒙太奇切过多件商品的特写，倒计时数字与彩带爆开的动感转场，饱和度高，运镜快，强烈的开播氛围感，9:16 竖屏',
  // 10. 大促促销
  '618 大促促销短视频：多件家居小电在礼盒台上阶梯式堆叠，镜头环绕上升展示全貌，红金渐变光影扫过商品表面，彩带与光斑落下，切到手拎购物袋走出画面的定格，节日氛围浓，动感运镜，画面中下部留白放价格信息，9:16 竖屏'
];

function vcFillPromptByIndex(index) {
  vcFillPrompt(videoHotPrompts[index] || '');
}

function vcFillPrompt(text) {
  document.getElementById('vcPromptInput').value = text;
  document.getElementById('vcPromptInput').focus();
}

async function optimizeVideoPrompt() {
  var input = document.getElementById('vcPromptInput');
  var btn = document.getElementById('btnOptimizeVcPrompt');
  var hint = document.getElementById('vcPromptOptimizeHint');
  if (!input) return;
  var raw = input.value.trim();
  if (!raw) { showToast('请先输入视频主题或简单描述'); input.focus(); return; }
  var oldText = btn ? btn.innerHTML : '';
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '优化中...'; }
    if (hint) hint.textContent = (modelNameById(getPickedModelId('vc-script')) || '大模型') + ' 正在优化视频提示词...';
    var systemPrompt = '你是国内短视频平台（抖音 / 快手 / 视频号 / 小红书 / B站）的广告片导演兼分镜导演，精通 AI 生视频提示词。把用户给的简单主题扩写成一条专业的生视频提示词。只输出这条提示词本身，用简体中文，不要解释、不要标题、不要 markdown。必须覆盖：主体、动作、场景、镜头运动、景别变化、节奏、光线、色调、风格、画质、时长感，默认 9:16 竖屏。字幕与口播一律简体中文。适配 Seedance / 豆包 / 混元 / MiniMax 等视频模型。内容要合规、适合品牌投放。';
    var userPrompt = '用户视频主题：' + raw + '\n\n请产出一条专业级中文生视频提示词，150-300 字，重点写清镜头语言、连续动作和成片质感。';
    // 复用 vc-script 这个文本模块 key（与本页的分镜脚本同一个文本模型下拉）——
    // 优化提示词和写分镜都是文本活儿，没必要给同一页开两个文本下拉让用户分辨。
    var optimized = (await callModuleText('vc-script', systemPrompt, userPrompt) || '').trim();
    if (!optimized) throw new Error('模型未返回优化结果');
    input.value = optimized.replace(/^(prompt|提示词)[：:]\s*/i, '').trim();
    input.focus();
    if (hint) hint.textContent = '已优化完成，可继续生成完整视频或分段式视频';
    showToast('✅ 视频提示词已优化（' + (modelNameById(getPickedModelId('vc-script')) || '') + '）');
  } catch (e) {
    console.error('[OptimizeVideoPrompt]', e);
    if (hint) hint.textContent = '优化失败，可稍后重试或换一个文本模型';
    showToast('⚠️ 提示词优化失败: ' + ((e && e.message) || '未知错误'));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText || 'AI优化提示词'; }
  }
}

function vcHandleRefUpload(input) {
  _vcApplyRefFile(input.files && input.files[0]);
}

// 同 _applyRefImageFile：点击与拖拽共用一条落地路径
function _vcApplyRefFile(f) {
  if (!f) return;
  if (!/^image\//.test(f.type)) {
    showToast((window.currentLang === 'en') ? '⚠️ Only image files are supported' : '⚠️ 只支持图片文件');
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    vcRefImageDataUrl = e.target.result;
    document.getElementById('vcRefPreview').src = vcRefImageDataUrl;
    document.getElementById('vcRefPreview').style.display = 'block';
    document.getElementById('vcRefPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(f);
}

async function vcGenerateVideo() {
  syncVideoModelFromPicker('video-create');  // 让下拉框选择驱动旧的状态变量
  var prompt = document.getElementById('vcPromptInput').value.trim();
  if (!prompt) { showToast('⚠️ 请输入视频提示词'); document.getElementById('vcPromptInput').focus(); return; }
  document.getElementById('vcStoryboardArea').style.display = 'none';
  var dur = parseInt(document.getElementById('vcDuration').value, 10) || 10;
  var style = document.getElementById('vcStyle').value;
  var styleSuffix = { auto: '', cinematic: '，电影质感，4K画质', 'tech-business': '，科技商务风格，干净光影，专业质感', anime: '，日系动漫风格', realistic: '，写实风格，自然光照', cartoon: '，卡通风格，色彩明亮' }[style] || '';
  // 追加字幕/口播中文约束，详见 ensureCnVisualPrompt
  var fullPrompt = await ensureCnVisualPrompt(prompt + styleSuffix, 'video');

  var resultBox = document.getElementById('vcResult');
  var loadingBox = document.getElementById('vcLoadingBox');
  var videoBox = document.getElementById('vcVideoBox');
  var errorBox = document.getElementById('vcErrorBox');
  var btn = document.getElementById('btnVcGenerate');

  resultBox.style.display = 'block';
  loadingBox.style.display = 'block';
  videoBox.style.display = 'none';
  errorBox.style.display = 'none';
  btn.disabled = true;
  var origBtn = btn.innerHTML;
  var vcModelNames = { agnes: 'Agnes AI video-v2.0', agnes25: 'Agnes AI Video 2.5', hunyuan: '腾讯混元 hy-video-1.5', minimax: 'MiniMax T2V-01', 'seedance-mini': 'Seedance 2 Mini' };
  var vcCurrentModelName = vcModelNames[vcSelectedModel] || 'Seedance 2 Mini';
  btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> ' + vcCurrentModelName + ' 生成中...';
  document.getElementById('vcLoadingText').textContent = '视频生成中（' + vcCurrentModelName + '）...';

  try {
    var videoUrl = '';
    var onProgress = function(cur, total, status) {
      document.getElementById('vcLoadingHint').textContent = '进度：' + cur + '/' + total + '（' + (status || '处理中') + '），已耗时约 ' + (cur * 5) + ' 秒';
    };
    // 将参考图传给每个视频模型调用
    var vcRef = vcRefImageDataUrl;
    if (vcSelectedModel === 'hunyuan') {
      videoUrl = await callHunyuanVideo(fullPrompt, onProgress, dur, null, vcRef);
    } else if (vcSelectedModel === 'agnes') {
      videoUrl = await callAgnesVideo(fullPrompt, onProgress, dur, null, vcRef);
    } else if (vcSelectedModel === 'agnes25') {
      videoUrl = await callAgnesVideo25(fullPrompt, onProgress, dur, null, vcRef);
    } else if (vcSelectedModel === 'seedance-mini') {
      videoUrl = await callSeedanceMiniVideo(fullPrompt, onProgress, dur, null, vcRef);
    } else {
      videoUrl = await callMiniMaxVideo(fullPrompt, onProgress, dur, null, vcRef);
    }
    if (!isValidGeneratedMediaUrl(videoUrl)) {
      throw new Error('视频生成接口未返回有效视频地址');
    }
    loadingBox.style.display = 'none';
    var player = document.getElementById('vcVideoPlayer');
    player.src = videoUrl;
    player.load();
    videoBox.style.display = 'block';
    document.getElementById('vcVideoMeta').innerHTML = '<div style="margin-bottom:8px;color:var(--green);font-weight:600;">视频生成成功，已获取视频地址并加载预览</div>'
      + '<div>模型：' + vcCurrentModelName + ' · 时长 ' + dur + ' 秒 · 风格 ' + style + '</div>'
      + '<div style="margin-top:8px;word-break:break-all;">视频链接：<a href="' + safeUrl(videoUrl) + '" target="_blank" style="color:var(--accent-light);">' + escapeHtml(videoUrl) + '</a></div>';
    showToast('✅ 视频生成成功，可点击播放预览');
    // 入资产库
    if (typeof generatedVideos !== 'undefined' && Array.isArray(generatedVideos)) {
      var vcPlatformNames = { agnes: 'Agnes AI', agnes25: 'Agnes AI Video 2.5', hunyuan: '腾讯混元', minimax: 'MiniMax', 'seedance-mini': 'Seedance 2 Mini' };
      generatedVideos.push({
        id: 'vc_' + Date.now(),
        url: videoUrl,
        content: videoUrl,
        prompt: fullPrompt,
        platform: vcPlatformNames[vcSelectedModel] || 'Seedance 2 Mini',
        model: vcSelectedModel,
        duration: dur,
        style: style,
        date: new Date().toLocaleString(),
        title: '视频创作 · ' + prompt.substring(0, 20)
      });
      // 立刻落盘 + 保存，别等 30 秒定时器（厂商链接会过期）
      if (typeof flushAssets === 'function') flushAssets();
    }
  } catch(err) {
    loadingBox.style.display = 'none';
    errorBox.style.display = 'block';
    var msg = (err && err.message) || String(err);
    document.getElementById('vcErrorMsg').textContent = '❌ ' + msg;
    var hint = '';
    if (/401|unauthorized|无效|invalid.*key|authentication/i.test(msg)) {
      hint = '原因：API Key 无效或已过期。请检查 server.py 顶部的 HY_API_KEY / MM_API_KEY。';
    } else if (/quota|exceeded|额度|insufficient/i.test(msg)) {
      hint = '原因：API 额度耗尽或套餐不含视频生成额度。请前往 minimax/腾讯云控制台充值或升级套餐。';
    } else if (/timeout|timed out|超时/i.test(msg)) {
      hint = '原因：调用超时。视频生成通常 1-3 分钟，可重试或换另一个模型。';
    } else if (/network|fetch|failed to fetch|connect/i.test(msg)) {
      hint = '原因：网络异常。请检查 server.py 是否启动（python server.py），以及代理路径 /api/* 是否能正常返回。';
    } else if (/safety|policy|violat|敏感|违规/i.test(msg)) {
      hint = '原因：提示词命中安全策略。请删除可能违规的词后重试。';
    } else {
      hint = '建议：① 切换到另一个视频模型重试 ② 在 F12 控制台查看完整请求和响应 ③ 检查 server.py 后台日志';
    }
    document.getElementById('vcErrorHint').textContent = hint;
    showToast('⚠️ 视频生成失败');
    console.error('[VideoCreate] ', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origBtn;
  }
}

// ====================== 分段式视频（视频创作板块）======================
function vcGenerateStoryboard() {
  var prompt = document.getElementById('vcPromptInput').value.trim();
  if (!prompt) { showToast('⚠️ 请输入视频提示词'); document.getElementById('vcPromptInput').focus(); return; }

  document.getElementById('vcResult').style.display = 'none';
  var area = document.getElementById('vcStoryboardArea');
  area.style.display = 'block';

  document.getElementById('vcStoryboardView').style.display = 'none';
  document.getElementById('vcStoryboardEdit').style.display = 'none';
  document.getElementById('btnVcGenStoryboard').style.display = '';
  document.getElementById('btnVcEditStoryboard').style.display = 'none';
  document.getElementById('btnVcSaveStoryboard').style.display = 'none';
  document.getElementById('btnVcCancelStoryboard').style.display = 'none';
  document.getElementById('btnVcGenSegments').style.display = 'none';
  document.getElementById('vcSegmentProgress').style.display = 'none';
  document.getElementById('vcSegmentResults').style.display = 'none';

  if (!document.getElementById('vcStoryboardView').textContent.trim()) {
    vcGenerateStoryboardScript();
  }
}

async function vcGenerateStoryboardScript() {
  syncVideoModelFromPicker('video-create');  // 让下拉框选择驱动旧的状态变量
  var prompt = document.getElementById('vcPromptInput').value.trim();
  if (!prompt) { showToast('⚠️ 请输入视频提示词'); return; }

  var btn = document.getElementById('btnVcGenStoryboard');
  var origText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 生成分镜中...';

  try {
    var dur = parseInt(document.getElementById('vcDuration').value, 10) || 30;
    var style = document.getElementById('vcStyle').value;
    var styleSuffix = { auto: '', cinematic: '，电影质感，4K画质', 'tech-business': '，科技商务风格，干净光影，专业质感', anime: '，日系动漫风格', realistic: '，写实风格，自然光照', cartoon: '，卡通风格，色彩明亮' }[style] || '';
    // 同 generateFullVideo：分镜标记必须是【分镜N】/画面：/文案：，否则 parseStoryboard 解析不出来
    var cnPrompt = await ensureCnVisualPrompt(prompt + styleSuffix, 'video');
    var systemPrompt = '你是国内短视频平台（抖音 / 快手 / 视频号 / 小红书）的分镜导演。画面描述与口播文案全部用简体中文。视频里的字幕、花字、口播一律中文，不要出现英文。';
    var userPrompt = '根据下面的视频创意，写一条 ' + dur + ' 秒的分镜脚本：\n\n' + cnPrompt + '\n\n要求：\n1. 拆成 5-8 个分镜，每个分镜 5-10 秒\n2. 每个分镜用【分镜N】开头，带时间区间、画面描述、口播文案\n3. 严格按下面的格式输出：\n【分镜1】0-10秒\n画面：XXX\n文案：XXX\n\n【分镜2】10-20秒\n画面：XXX\n文案：XXX\n\n4. 只输出纯文本，不要 markdown 代码块，不要任何额外说明';
    var script = await callModuleText('vc-script', systemPrompt, userPrompt);
    if (!script) throw new Error('分镜脚本生成失败');

    var _normalizedVcScript = normalizeCopyText(script);
    document.getElementById('vcStoryboardView').textContent = _normalizedVcScript;
    document.getElementById('vcStoryboardEdit').value = _normalizedVcScript;
    document.getElementById('vcStoryboardView').style.display = 'block';
    document.getElementById('btnVcGenStoryboard').style.display = 'none';
    document.getElementById('btnVcEditStoryboard').style.display = '';
    document.getElementById('btnVcGenSegments').style.display = '';
    showToast('✅ 分镜脚本已生成');
  } catch(err) {
    console.error(err);
    showToast('⚠️ 分镜脚本生成失败: ' + (err.message || '未知错误'));
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

function vcEditStoryboard() {
  var view = document.getElementById('vcStoryboardView');
  var edit = document.getElementById('vcStoryboardEdit');
  edit.value = view.textContent;
  view.style.display = 'none';
  edit.style.display = 'block';
  edit.focus();
  document.getElementById('btnVcEditStoryboard').style.display = 'none';
  document.getElementById('btnVcGenSegments').style.display = 'none';
  document.getElementById('btnVcSaveStoryboard').style.display = '';
  document.getElementById('btnVcCancelStoryboard').style.display = '';
}

function vcSaveStoryboard() {
  var edit = document.getElementById('vcStoryboardEdit');
  var view = document.getElementById('vcStoryboardView');
  view.textContent = edit.value.trim();
  view.style.display = 'block';
  edit.style.display = 'none';
  document.getElementById('btnVcSaveStoryboard').style.display = 'none';
  document.getElementById('btnVcCancelStoryboard').style.display = 'none';
  document.getElementById('btnVcEditStoryboard').style.display = '';
  document.getElementById('btnVcGenSegments').style.display = '';
  showToast('✅ 分镜脚本已保存');
}

function vcCancelStoryboardEdit() {
  var view = document.getElementById('vcStoryboardView');
  var edit = document.getElementById('vcStoryboardEdit');
  edit.value = view.textContent;
  view.style.display = 'block';
  edit.style.display = 'none';
  document.getElementById('btnVcSaveStoryboard').style.display = 'none';
  document.getElementById('btnVcCancelStoryboard').style.display = 'none';
  document.getElementById('btnVcEditStoryboard').style.display = '';
  document.getElementById('btnVcGenSegments').style.display = '';
}

async function vcGenerateSegments() {
  var scriptText = document.getElementById('vcStoryboardView').textContent.trim();
  if (!scriptText) { showToast('⚠️ 请先生成分镜脚本'); return; }

  var segments = parseStoryboard(scriptText);
  if (segments.length === 0) { showToast('⚠️ 未能解析出分镜，请检查格式（需包含【分镜1】标记）'); return; }

  var prompt = document.getElementById('vcPromptInput').value.trim();
  var style = document.getElementById('vcStyle').value;
  var styleSuffix = { auto: '', cinematic: '，电影质感，4K画质', 'tech-business': '，科技商务风格，干净光影，专业质感', anime: '，日系动漫风格', realistic: '，写实风格，自然光照', cartoon: '，卡通风格，色彩明亮' }[style] || '';
  var progressDiv = document.getElementById('vcSegmentProgress');
  var resultsDiv = document.getElementById('vcSegmentResults');
  progressDiv.style.display = 'block';
  resultsDiv.style.display = 'none';

  var vcModelNames = { agnes: 'Agnes AI video-v2.0', agnes25: 'Agnes AI Video 2.5', hunyuan: '腾讯混元 hy-video-1.5', minimax: 'MiniMax T2V-01', 'seedance-mini': 'Seedance 2 Mini' };
  var modelName = vcModelNames[vcSelectedModel] || 'Seedance 2 Mini';

  var progressHtml = '<div style="font-size:14px;font-weight:600;margin-bottom:12px;">🎬 分镜生成进度 · ' + modelName + '</div>'
    + '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">共 ' + segments.length + ' 个分镜</div>';
  for (var i = 0; i < segments.length; i++) {
    progressHtml += '<div id="vc-seg-prog-' + i + '" style="margin-bottom:10px;padding:10px 14px;background:var(--bg-tertiary);border-radius:8px;display:flex;align-items:center;gap:10px;">'
      + '<div id="vc-seg-dot-' + i + '" style="width:10px;height:10px;border-radius:50%;background:var(--text-secondary);flex-shrink:0;"></div>'
      + '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">分镜' + (i+1) + '：' + (segments[i].time || '待定') + '</div>'
      + '<div style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (segments[i].visual || '').substring(0,40) + '</div></div>'
      + '<span id="vc-seg-status-' + i + '" style="font-size:11px;color:var(--text-secondary);flex-shrink:0;">等待中</span></div>';
  }
  progressDiv.innerHTML = progressHtml;

  var btn = document.getElementById('btnVcGenSegments');
  var origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 生成片段中...';

  var okVideos = [];
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    var dot = document.getElementById('vc-seg-dot-' + i);
    var statusEl = document.getElementById('vc-seg-status-' + i);
    if (dot) { dot.style.background = '#f59e0b'; dot.style.animation = 'pulse 1s infinite'; }
    if (statusEl) statusEl.textContent = '生成中...';

    var segPromptRaw = '短视频片段：' + (seg.visual || '') + '。' + (seg.text || '') + '。' + styleSuffix;
    // 追加字幕/口播中文约束（分镜可能被用户手改过）
    var segPrompt = await ensureCnVisualPrompt(segPromptRaw, 'video');
    var segDuration = Math.max(5, Math.min(15, parseInt(seg.duration) || 8));

    try {
      var pc = (function(idx) { return function(poll, maxPoll, status) { var s = document.getElementById('vc-seg-status-' + idx); if (s) s.textContent = '轮询 ' + poll + '/' + maxPoll; }; })(i);
      var vUrl;
      // 分镜视频同样携带参考图；若用户提供了，每张片段都引用同一张
      var vcRef = vcRefImageDataUrl;
      if (vcSelectedModel === 'hunyuan') { vUrl = await callHunyuanVideo(segPrompt, pc, segDuration, null, vcRef); }
      else if (vcSelectedModel === 'agnes') { vUrl = await callAgnesVideo(segPrompt, pc, segDuration, null, vcRef); }
      else if (vcSelectedModel === 'agnes25') { vUrl = await callAgnesVideo25(segPrompt, pc, segDuration, null, vcRef); }
      else if (vcSelectedModel === 'seedance-mini') { vUrl = await callSeedanceMiniVideo(segPrompt, pc, segDuration, null, vcRef); }
      else { vUrl = await callMiniMaxVideo(segPrompt, pc, segDuration, null, vcRef); }
      if (vUrl) { okVideos.push({ url: vUrl, idx: i, seg: seg }); if (dot) { dot.style.background = '#10b981'; dot.style.animation = ''; } if (statusEl) statusEl.textContent = '✅'; }
      else { if (dot) { dot.style.background = '#ef4444'; dot.style.animation = ''; } if (statusEl) statusEl.textContent = '❌ 失败'; }
    } catch (se) {
      console.error('Segment ' + i + ' error:', se);
      if (dot) { dot.style.background = '#ef4444'; dot.style.animation = ''; }
      if (statusEl) statusEl.textContent = '❌ ' + (se.message || '失败').substring(0,10);
    }
    if (i < segments.length - 1) { await new Promise(function(r) { setTimeout(r, 2000); }); }
  }

  btn.disabled = false;
  btn.innerHTML = origText;

  resultsDiv.style.display = 'block';
  var resultsHtml = '<div style="font-size:14px;font-weight:600;margin-bottom:12px;">🎬 分段视频结果（' + okVideos.length + '/' + segments.length + ' 成功）</div>';
  if (okVideos.length === 0) {
    resultsHtml += '<div style="padding:24px;text-align:center;color:var(--text-secondary);">所有片段生成失败，请检查API配置或提示词后重试。</div>';
  } else {
    for (var j = 0; j < okVideos.length; j++) {
      var gv = okVideos[j];
      resultsHtml += '<div style="margin-bottom:16px;border:1px solid var(--border);border-radius:12px;overflow:hidden;">'
        + '<div style="padding:10px 14px;background:var(--bg-tertiary);font-size:13px;font-weight:500;">分镜' + (gv.idx+1) + '：' + (gv.seg.time || '') + '</div>'
        + '<video controls autoplay muted playsinline style="width:100%;display:block;max-height:400px;background:#000;"><source src="' + safeUrl(gv.url) + '" type="video/mp4"></video>'
        + '<div style="padding:8px 12px;font-size:11px;color:var(--text-secondary);word-break:break-all;background:var(--bg-secondary);">视频链接：<a href="' + safeUrl(gv.url) + '" target="_blank" style="color:var(--accent-light);">' + escapeHtml(gv.url) + '</a></div></div>';
    }
  }
  resultsHtml += '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;"><span style="font-size:12px;color:var(--text-secondary);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">🤖 ' + modelName + ' 分段生成</span><span style="font-size:12px;color:var(--green);background:var(--bg-tertiary);padding:4px 10px;border-radius:6px;">' + okVideos.length + ' 片段</span></div>';
  resultsDiv.innerHTML = resultsHtml;

  if (okVideos.length > 0 && typeof generatedVideos !== 'undefined' && Array.isArray(generatedVideos)) {
    var vcPlatformNames = { agnes: 'Agnes AI', agnes25: 'Agnes AI Video 2.5', hunyuan: '腾讯混元', minimax: 'MiniMax', 'seedance-mini': 'Seedance 2 Mini' };
    // 每个分段都入库（原来只留 okVideos[0]，其余段落白生成了）
    for (var sg = 0; sg < okVideos.length; sg++) {
      generatedVideos.push({
        id: 'vc_seg_' + Date.now() + '_' + sg,
        url: okVideos[sg].url,
        content: okVideos[sg].url,
        prompt: prompt,
        platform: vcPlatformNames[vcSelectedModel] || 'Seedance 2 Mini',
        model: vcSelectedModel,
        duration: '分段',
        style: style,
        date: new Date().toLocaleString(),
        title: '视频创作 · 分段 ' + (sg + 1) + '/' + okVideos.length + ' · ' + prompt.substring(0, 20)
      });
    }
    if (typeof flushAssets === 'function') flushAssets();
  }
  showToast('✅ 分段视频生成完成！' + okVideos.length + '/' + segments.length + ' 成功');
}

// ============ 提示词配置管理 ============
var defaultPrompts = [
  {
    "id": "hotspot-system",
    "module": "热点发现",
    "name": "热点情报系统 Prompt",
    "language": "zh",
    "content": "你是一个实时热点情报系统。你有最新的互联网热点数据。请根据用户要求返回真实的热点话题数据。\n\n重要格式要求：你必须严格按照以下JSON数组格式返回，每个元素是一个热点对象，不要包含任何markdown标记或额外文字：\n[{\"title\":\"话题标题\",\"summary\":\"话题摘要（50-100字）\",\"cat\":\"ai/content/short-video/platform/trend/monetize 之一\",\"hotness\":80-99的数字,\"source\":\"来源平台名\"}]"
  },
  {
    "id": "article-wechat",
    "module": "图文生成",
    "name": "微信公众号 人设 Prompt",
    "language": "zh",
    "content": "你是一位资深行业分析师，拥有10年内容行业研究经验。写作风格：冷静、专业、数据驱动、逻辑严密。你擅长用三层分析框架来深度拆解话题。输出格式：用HTML输出，h3做小标题，p做段落，strong强调关键观点。字数1500-2500。"
  },
  {
    "id": "article-xiaohongshu",
    "module": "图文生成",
    "name": "小红书 人设 Prompt",
    "language": "zh",
    "content": "你是一位生活方式策展人，小红书10万粉博主。写作风格：精致温暖、审美在线、利他分享。多用emoji点缀、清单体、亲测分享体。开头一句要能停下手指（痛点或反差），正文给可复制的具体做法（型号、价格带、场景），结尾引导收藏与评论区提问。避免绝对化用词和硬广话术（不写\"最\"\"第一\"\"包治\"）。输出格式：用HTML输出，h3做小标题，p做段落，strong强调关键观点。字数800-1500。"
  },
  {
    "id": "article-toutiao",
    "module": "图文生成",
    "name": "今日头条 人设 Prompt",
    "language": "zh",
    "content": "你是一位今日头条资深内容作者，深谙头条算法的推荐逻辑：标题决定点击、前三段决定完读、争议点决定评论。写作风格：信息密度高、事实优先、句子短、结论前置。写给泛人群看，不用行业黑话，专业名词随手解释一句。正文里至少落一个具体数字、时间或地点，让人信。结尾抛一个能引发讨论的开放问题（评论量是头条的核心推荐信号）。输出格式：用HTML输出，h3做小标题，p做段落，strong强调关键观点。字数1000-1800。"
  },
  {
    "id": "article-zhihu",
    "module": "图文生成",
    "name": "知乎 人设 Prompt",
    "language": "zh",
    "content": "你是一位知乎高赞答主，擅长把复杂问题讲透。知乎读者反感营销号腔调，认「有实证、有推导、承认边界」的内容。写作风格：先给结论，再给论证链，敢写「什么情况下不适用」。至少给出一次可验证的依据（数据、机制、亲测过程），并明确信息来源类型。允许适度专业深度，但每个术语第一次出现时用一句话解释。结尾不喊口号，给一个判断标准让读者自己套。禁止夸张标题党句式。输出格式：用HTML输出，h2/h3做小标题，p做段落，strong强调关键观点，ul/li做清单。字数1500-2500。"
  },
  {
    "id": "article-weibo",
    "module": "图文生成",
    "name": "微博 人设 Prompt",
    "language": "zh",
    "content": "你是一位微博运营操盘手，做过多次品牌热点营销。微博是公域舆论场，讲究「快、短、有态度、可转发」。写作风格：观点鲜明、句子极短、自带情绪但不失控。开头第一句就是能被单独截图转发的那句。正文分 3-6 个短段，每段一个独立可传播的点，不写「下面详细展开」这种铺垫。可自然带 1-2 个话题词（写成 #话题# 形式）放在结尾单独一行，正文里不堆话题。禁止长篇论述和小标题体。输出格式：用HTML输出，p做段落，strong标出适合截图的金句。字数400-800。"
  },
  {
    "id": "video-shipinhao",
    "module": "短视频生成",
    "name": "视频号 脚本 Prompt",
    "language": "zh",
    "content": "你是一位视频号短视频策划专家，精通微信社交分发机制。视频号用户偏好真实感、信任感和深度内容。脚本格式：[时间] 场景 → 画面描述 → 文案台词 → 字幕/BGM。侧重娓娓道来的节奏。"
  },
  {
    "id": "video-douyin",
    "module": "短视频生成",
    "name": "抖音 脚本 Prompt",
    "language": "zh",
    "content": "你是一位抖音爆款短视频策划师。抖音前3秒定生死，需要强钩子和情绪冲击。脚本格式:[时间] 场景 → 画面描述 → 文案台词 → 字幕/BGM。侧重快节奏和反常识钩子。"
  },
  {
    "id": "video-kuaishou",
    "module": "短视频生成",
    "name": "快手 脚本 Prompt",
    "language": "zh",
    "content": "你是一位快手短视频创作达人，深谙老铁文化。快手用户爱看真实故事和实操。脚本格式：[时间] 场景 → 画面描述 → 文案台词 → 字幕/BGM。侧重真诚感和实操性。"
  },
  {
    "id": "video-xiaohongshu",
    "module": "短视频生成",
    "name": "小红书 脚本 Prompt",
    "language": "zh",
    "content": "你是一位小红书视频博主，审美在线。小红书视频注重封面质感和温暖分享。脚本格式：[时间] 场景 → 画面描述 → 文案台词 → 字幕/BGM。侧重治愈系和清单体，禁止绝对化用词和硬广话术。"
  },
  {
    "id": "video-bilibili",
    "module": "短视频生成",
    "name": "B站 脚本 Prompt",
    "language": "zh",
    "content": "你是一位B站UP主内容策划。B站观众忍不了废话开场，认干货、认梗、认真诚。脚本格式：[时间] 场景 → 画面描述 → 文案台词 → 字幕/BGM。开场直接抛结论或抛冲突，中段密度高、有数据有对比，可设计弹幕互动点，结尾一句「三连」引导。"
  },
  {
    "id": "image-system",
    "module": "图片创作",
    "name": "图片创作 System Prompt",
    "language": "zh",
    "content": "你是一位商业视觉创意总监，擅长将用户的营销目标转化为可执行的图片生成提示词。请输出结构化图片提示词，包含主体、场景、构图、光影、色彩、风格、平台适配与负面约束。提示词应适合直接调用图片生成模型，不要生成具体素材芯片。"
  },
  {
    "id": "vc-system",
    "module": "视频创作",
    "name": "视频创作 System Prompt",
    "language": "zh",
    "content": "你是一位AI视频导演，擅长将用户创意转化为可执行的视频生成提示词。请根据主题补全主体、动作、镜头运动、场景、光影、节奏、画幅和时长要求，输出适合视频大模型直接生成的高质量提示词。"
  },
  {
    "id": "vc-storyboard",
    "module": "视频创作",
    "name": "分镜导演 System Prompt",
    "language": "zh",
    "content": "你是一个短视频分镜导演。请根据用户的视频创意，生成详细的分镜脚本。"
  },
  {
    "id": "comment-derive",
    "module": "评论运营",
    "name": "评论衍生 System Prompt",
    "language": "zh",
    "content": "你是一个资深的社交媒体运营专家，擅长评论运营和引流话术设计。你的任务是根据用户提供的一条热门评论，衍生出N条风格不同但核心意图相似的评论。每条衍生评论必须：1）保持真诚自然，不显得是复制粘贴；2）巧妙植入对博主/内容的赞美和推荐意图；3）适当使用emoji增加亲和力；4）每条长度控制在30-100字。请用JSON数组格式返回，每个元素为 { \"text\": \"评论内容\" }，不要输出其他内容。"
  },
  {
    "id": "reply-system",
    "module": "评论运营",
    "name": "棘手评论回复 System Prompt",
    "language": "zh",
    "content": "你是一个顶尖的自媒体评论运营专家，精通心理学和沟通技巧。你的任务是：\n1. 先分析用户评论的意图（intent），必须从以下5类中严格选择1个字符串：\"咨询\"、\"夸赞\"、\"吐槽\"、\"广告\"、\"其他\"\n2. 然后生成N份回复文案，每条不超过80字，语气匹配对应平台调性\n3. 回复策略：\n  - 咨询类：明确给方向，可引导私域但不生硬\n  - 夸赞类：真诚感谢+延伸互动（如提问引导用户多分享）\n  - 吐槽类：先共情再引导，不争论不激化\n  - 广告类：礼貌但坚定地不接广告，可转为正面互动\n  - 其他类：通用客气回复，留有余地\n\n请严格用以下JSON格式返回，不要输出任何其他文字：\n{\"intent\":\"咨询\",\"replies\":[\"回复1\",\"回复2\",\"回复3\"]}"
  },
  {
    "id": "hit-analysis",
    "module": "爆款拆解",
    "name": "爆款拆解 System Prompt",
    "language": "zh",
    "content": "你是一位顶级内容爆款分析师，拥有15年病毒内容研究经验。你曾任职于字节跳动内容策略部，深度参与过抖音、视频号、小红书的爆款内容标准制定。你精通：①平台推荐算法的底层逻辑；②用户心理触发机制（情绪共振、认知偏差、社交货币）；③爆款内容的DNA解构。你的分析风格：犀利、有洞见、用数据和案例说话、给出可操作的方法论。你输出的分析能让创作者直接照着做。输出格式：用HTML输出，h2/h3做小标题，p做段落，strong强调关键观点，ul/li做清单。字数2000-3000。"
  }
];

// 图文生成专用：这些 id 的 prompt 曾经是「文案 + 视频脚本」双用途，
// 会让「图文生成」的软文里硬生生多出一段带 [00:00] 时间轴的短视频脚本。
// 现在默认值已改成纯软文，但**老用户的 DB 里存着旧文本**，而 mergePromptDefaults
// 的规则是"saved 覆盖 default" —— 只改默认值对已有账号完全无效。
// 所以这里按特征串做一次一次性升级：检测到脚本段特征就丢弃 saved、改用新默认。
// 判据用的是"结构性特征"（Script 小标题 / [00:00] 时间轴 / VO: 行），
// 不是版本号 —— 用户自己改过的 prompt 只要不含这些特征就不会被动到。
var ARTICLE_PROMPT_IDS = ['article-xiaohongshu', 'article-wechat', 'article-toutiao', 'article-zhihu', 'article-weibo'];
function promptHasVideoScript(content) {
  var s = String(content || '');
  return /###[^\n]*\b(script|storyboard|reels)\b/i.test(s)
      || /\[\d{2}:\d{2}\s*[–—-]\s*\d{2}:\d{2}\]/.test(s)
      || /\bVO:\s*"/.test(s)
      || /\bFrame\s*\d\s*\(\d/i.test(s);
}

function mergePromptDefaults(savedPrompts) {
  var allowedIds = {};
  for (var i = 0; i < defaultPrompts.length; i++) allowedIds[defaultPrompts[i].id] = true;
  var savedMap = {};
  if (Array.isArray(savedPrompts)) {
    for (var j = 0; j < savedPrompts.length; j++) {
      if (savedPrompts[j] && allowedIds[savedPrompts[j].id]) savedMap[savedPrompts[j].id] = savedPrompts[j];
    }
  }
  var merged = [];
  for (var k = 0; k < defaultPrompts.length; k++) {
    var base = JSON.parse(JSON.stringify(defaultPrompts[k]));
    var saved = savedMap[base.id];
    if (saved && typeof saved.content === 'string') {
      // 图文类 prompt 里残留视频脚本段 → 弃用 saved，回到新默认（纯软文）
      var isArticlePrompt = ARTICLE_PROMPT_IDS.indexOf(base.id) >= 0;
      if (isArticlePrompt && promptHasVideoScript(saved.content)) {
        console.log('[Prompts] 升级 ' + base.id + '：旧版含短视频脚本段，已切换为纯软文 prompt');
      } else {
        base.content = saved.content;
      }
    }
    merged.push(base);
  }
  savePrompts(merged);
  return merged;
}

// 用户提示词缓存（bootAppData 时从 /api/data/prompts 预载）
window._userPromptsCache = null;

function loadPrompts() {
  // 优先用后端预载的缓存；无缓存时回退默认（首次/未登录）
  if (window._userPromptsCache && window._userPromptsCache.length) {
    return mergePromptDefaults(window._userPromptsCache);
  }
  return JSON.parse(JSON.stringify(defaultPrompts));
}

function savePrompts(prompts) {
  window._userPromptsCache = prompts;
  // 后台推送到后端（按用户隔离持久化）
  if (window.currentUser) {
    fetch('/api/data/prompts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: prompts })
    }).catch(function(e) { console.warn('[savePrompts] push failed', e && e.message); });
  }
}

function getReadableSyncError(resp, text, data) {
  if (resp && resp.status === 404) {
    return '同步接口 /api/sync_config 未生效，请先停止旧服务并重新运行 server.py，然后刷新页面再保存';
  }
  if (resp && resp.status === 405) {
    return '同步接口请求方法不被当前服务支持，请重启 server.py 后重试';
  }
  if (data && data.error) return String(data.error).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (text && /^\s*</.test(text)) return '后端返回了 HTML 错误页，请确认 server.py 已重启且访问的是 http://localhost:8766';
  if (text) return text.replace(/\s+/g, ' ').trim().slice(0, 180);
  return '同步写入源码失败';
}

async function syncProjectConfig(kind, payload) {
  if (window.location.protocol === 'file:') {
    throw new Error('file 模式无法写回源码，请通过 server.py 启动后访问 http://localhost:8766');
  }
  var body = Object.assign({ kind: kind }, payload || {});
  var resp = await fetch('/api/sync_config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var text = await resp.text();
  var data = {};
  try { data = text ? JSON.parse(text) : {}; } catch(e) { data = {}; }
  if (!resp.ok || data.success === false) throw new Error(getReadableSyncError(resp, text, data));
  return data;
}

var promptsCache = null;
function getPrompts() {
  if (!promptsCache) promptsCache = loadPrompts();
  return promptsCache;
}

function renderPromptList() {
  var prompts = getPrompts();
  var searchEl = document.getElementById('promptSearch');
  var search = ((searchEl && searchEl.value) || '').trim().toLowerCase();
  var module = document.getElementById('promptModuleFilter').value;
  var langFilterEl = document.getElementById('promptLangFilter');
  var lang = langFilterEl ? langFilterEl.value : '';

  var filtered = prompts.filter(function(p) {
    var name = (p.name || '').toLowerCase();
    var content = (p.content || '').toLowerCase();
    var mod = (p.module || '').toLowerCase();
    var matchSearch = !search || name.indexOf(search) >= 0 || content.indexOf(search) >= 0 || mod.indexOf(search) >= 0;
    var matchModule = !module || p.module === module;
    var matchLang = !lang || (p.language || 'zh') === lang;
    return matchSearch && matchModule && matchLang;
  });

  var list = document.getElementById('promptList');
  var empty = document.getElementById('promptEmpty');

  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  var moduleColors = {
    '热点发现': '#f59e0b', '图文生成': '#3b82f6', '短视频生成': '#8b5cf6',
    '图片创作': '#ec4899', '视频创作': '#6366f1', '评论运营': '#10b981', '爆款拆解': '#ef4444'
  };

  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var p = filtered[i];
    var color = moduleColors[p.module] || '#f97316';
    var preview = p.content.length > 120 ? p.content.substring(0, 120).replace(/\n/g, ' ') + '...' : p.content.replace(/\n/g, ' ');
    html += '<div style="background:var(--bg-tertiary);border:1px solid var(--border);border-radius:12px;padding:16px;transition:all 0.2s;cursor:pointer;" onmouseenter="this.style.borderColor=\'' + color + '\'" onmouseleave="this.style.borderColor=\'var(--border)\'" onclick="editPrompt(\'' + p.id + '\')">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
      + '<span style="font-size:11px;background:' + color + '20;color:' + color + ';padding:2px 10px;border-radius:8px;font-weight:500;">' + p.module + '</span>'
      + '<span style="font-size:15px;font-weight:600;color:var(--text-primary);">' + p.name + '</span>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5;font-family:monospace;">' + preview + '</div>'
      + '<div style="margin-top:8px;font-size:11px;color:' + color + ';">点击编辑 →</div>'
      + '</div>';
  }
  list.innerHTML = html;
}

var editingPromptId = null;
function editPrompt(id) {
  var prompts = getPrompts();
  var p = null;
  for (var i = 0; i < prompts.length; i++) {
    if (prompts[i].id === id) { p = prompts[i]; break; }
  }
  if (!p) return;
  editingPromptId = id;
  document.getElementById('promptEditModule').textContent = p.module;
  document.getElementById('promptEditName').textContent = p.name;
  document.getElementById('promptEditContent').value = p.content;
  var modal = document.getElementById('promptEditModal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePromptEdit() {
  document.getElementById('promptEditModal').style.display = 'none';
  document.body.style.overflow = '';
  editingPromptId = null;
}

async function savePromptEdit() {
  if (!editingPromptId) return;
  var newContent = document.getElementById('promptEditContent').value;
  var prompts = getPrompts();
  for (var i = 0; i < prompts.length; i++) {
    if (prompts[i].id === editingPromptId) {
      prompts[i].content = newContent;
      break;
    }
  }
  savePrompts(prompts);
  try {
    await syncProjectConfig('prompts', { prompts: prompts });
    closePromptEdit();
    renderPromptList();
    showToast('✅ 提示词已保存，并已同步写入 index.html');
  } catch (e) {
    console.error('[SyncPrompts]', e);
    closePromptEdit();
    renderPromptList();
    showToast('⚠️ 提示词已保存到浏览器，但写入 index.html 失败：' + ((e && e.message) || '未知错误'));
  }
}

async function resetAllPrompts() {
  if (!confirm('确定要恢复所有提示词为默认值吗？你自定义的修改将丢失。')) return;
  localStorage.removeItem('workbuddy_prompts');
  promptsCache = JSON.parse(JSON.stringify(defaultPrompts));
  try {
    await syncProjectConfig('prompts', { prompts: promptsCache });
    renderPromptList();
    showToast('✅ 已恢复默认提示词，并已同步写入 index.html');
  } catch (e) {
    renderPromptList();
    showToast('⚠️ 已恢复浏览器默认提示词，但写入 index.html 失败：' + ((e && e.message) || '未知错误'));
  }
}


// ============ 大模型一键导入 (通过 API /v1/models 探测获取) ============

var IMPORT_PRESETS = {
  deepseek: {
    provider: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'OpenAI 兼容协议'
  },
  siliconflow: {
    provider: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    protocol: 'OpenAI 兼容协议'
  },
  dashscope: {
    provider: '阿里云通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'OpenAI 兼容协议'
  },
  kimi: {
    provider: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    protocol: 'OpenAI 兼容协议'
  },
  zhipu: {
    provider: '智谱清言 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'OpenAI 兼容协议'
  },
  openai: {
    provider: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'OpenAI 兼容协议'
  },
  oneapi: {
    provider: 'OneAPI 中转',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'OpenAI 兼容协议'
  },
  ollama: {
    provider: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    protocol: 'OpenAI 兼容协议'
  }
};

var _fetchedRemoteModels = [];
var _remoteSuggestedChatUrl = '';

function openImportModelsModal() {
  var modal = document.getElementById('importModelsModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  var status = document.getElementById('importFetchStatus');
  if (status) status.textContent = '';
}

function closeImportModelsModal() {
  var modal = document.getElementById('importModelsModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function applyImportPreset(key) {
  var p = IMPORT_PRESETS[key];
  if (!p) return;
  var bUrl = document.getElementById('importBaseUrl');
  var prov = document.getElementById('importProvider');
  var proto = document.getElementById('importProtocol');
  if (bUrl) bUrl.value = p.baseUrl;
  if (prov) prov.value = p.provider;
  if (proto) proto.value = p.protocol;
  var status = document.getElementById('importFetchStatus');
  if (status) {
    status.textContent = '已填充 ' + p.provider + ' 预设配置，请填写对应 API Key 后点击获取';
    status.style.color = 'var(--accent-light)';
  }
}

function toggleImportApiKeyVisibility() {
  var inp = document.getElementById('importApiKey');
  var btn = document.getElementById('toggleImportKeyBtn');
  if (!inp || !btn) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🙈 隐藏';
  } else {
    inp.type = 'password';
    btn.textContent = '👁 显示';
  }
}

async function fetchRemoteModels() {
  var baseUrl = (document.getElementById('importBaseUrl').value || '').trim();
  var apiKey = (document.getElementById('importApiKey').value || '').trim();
  var protocol = (document.getElementById('importProtocol').value || 'OpenAI 兼容协议').trim();
  var provider = (document.getElementById('importProvider').value || '').trim();
  var statusEl = document.getElementById('importFetchStatus');
  var btn = document.getElementById('btnFetchRemoteModels');

  if (!baseUrl) {
    if (statusEl) { statusEl.textContent = '⚠️ 请先填写 Base URL'; statusEl.style.color = '#ef4444'; }
    return;
  }

  btn.disabled = true;
  var origHtml = btn.innerHTML;
  btn.innerHTML = '<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:currentColor;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 正在拉取中...';
  if (statusEl) { statusEl.textContent = '正在连接远端 API 获取模型列表...'; statusEl.style.color = 'var(--text-secondary)'; }

  try {
    var resp = await fetch('/api/models/fetch_remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_url: baseUrl,
        api_key: apiKey,
        protocol: protocol
      })
    });
    var data = await resp.json();

    if (!resp.ok || !data.success) {
      var errMsg = (data && data.error) || ('HTTP ' + resp.status);
      if (statusEl) { statusEl.textContent = '❌ ' + errMsg; statusEl.style.color = '#ef4444'; }
      return;
    }

    _fetchedRemoteModels = data.models || [];
    _remoteSuggestedChatUrl = data.suggested_chat_endpoint || baseUrl;

    if (!provider && data.detected_provider) {
      document.getElementById('importProvider').value = data.detected_provider;
    }

    if (statusEl) {
      statusEl.textContent = '✅ 成功获取 ' + _fetchedRemoteModels.length + ' 个模型';
      statusEl.style.color = '#22c55e';
    }

    document.getElementById('importResultsPanel').style.display = 'flex';
    renderImportModelsList();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = '❌ 连接失败：' + ((err && err.message) || '网络错误');
      statusEl.style.color = '#ef4444';
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
}

function renderImportModelsList() {
  var box = document.getElementById('importModelsListBox');
  if (!box) return;

  var currentModels = getModels();
  var existingSlugs = {};
  for (var i = 0; i < currentModels.length; i++) {
    if (currentModels[i].model) existingSlugs[currentModels[i].model.toLowerCase()] = true;
    if (currentModels[i].id) existingSlugs[currentModels[i].id.toLowerCase()] = true;
  }

  var searchKw = (document.getElementById('importSearchInput').value || '').trim().toLowerCase();

  var html = '';
  var visibleCount = 0;
  var selectedCount = 0;

  for (var i = 0; i < _fetchedRemoteModels.length; i++) {
    var m = _fetchedRemoteModels[i];
    var idLower = m.id.toLowerCase();
    if (searchKw && idLower.indexOf(searchKw) === -1 && (m.name || '').toLowerCase().indexOf(searchKw) === -1) {
      continue;
    }

    visibleCount++;
    var isChecked = m.checked !== false;
    if (isChecked) selectedCount++;

    var isExisting = !!existingSlugs[idLower];
    var tagExisting = isExisting
      ? '<span style="font-size:11px;background:rgba(234,179,8,0.15);color:#eab308;padding:2px 8px;border-radius:6px;border:1px solid rgba(234,179,8,0.3);">已在配置中</span>'
      : '<span style="font-size:11px;background:rgba(34,197,94,0.15);color:#22c55e;padding:2px 8px;border-radius:6px;border:1px solid rgba(34,197,94,0.3);">新模型</span>';

    html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:10px 14px;transition:all 0.2s;">'
      + '<div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">'
      + '<input type="checkbox" style="cursor:pointer;width:16px;height:16px;accent-color:var(--accent);" '
      + (isChecked ? 'checked ' : '')
      + 'onchange="onToggleImportModelItem(' + i + ', this.checked)"/>'
      + '<div style="min-width:0;flex:1;">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      + '<span style="font-size:13px;font-weight:600;color:var(--text-primary);font-family:monospace;word-break:break-all;">' + escapeHtml(m.id) + '</span>'
      + tagExisting
      + '</div>'
      + (m.owned_by ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">所属：' + escapeHtml(m.owned_by) + '</div>' : '')
      + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'
      + '<select class="input" style="padding:3px 8px;font-size:12px;width:110px;" onchange="onChangeImportModelType(' + i + ', this.value)">'
      + '<option value="text"' + (m.type === 'text' ? ' selected' : '') + '>📝 文本模型</option>'
      + '<option value="image"' + (m.type === 'image' ? ' selected' : '') + '>🖼️ 图片模型</option>'
      + '<option value="video"' + (m.type === 'video' ? ' selected' : '') + '>🎬 视频模型</option>'
      + '</select>'
      + '</div>'
      + '</div>';
  }

  if (visibleCount === 0) {
    html = '<div style="text-align:center;padding:30px;color:var(--text-secondary);font-size:13px;">无匹配模型，请尝试更换搜索关键字</div>';
  }

  box.innerHTML = html;

  var sumEl = document.getElementById('importSummaryText');
  if (sumEl) sumEl.textContent = '共获取到 ' + _fetchedRemoteModels.length + ' 个模型，已选择 ' + selectedCount + ' 个';

  var btnConfirm = document.getElementById('btnConfirmImport');
  if (btnConfirm) {
    btnConfirm.disabled = (selectedCount === 0);
    btnConfirm.style.opacity = (selectedCount === 0) ? '0.6' : '1';
    btnConfirm.textContent = '📥 确认导入所选模型 (' + selectedCount + ')';
  }
}

function onToggleImportModelItem(index, checked) {
  if (_fetchedRemoteModels[index]) {
    _fetchedRemoteModels[index].checked = checked;
  }
  updateImportSelectionSummary();
}

function onChangeImportModelType(index, type) {
  if (_fetchedRemoteModels[index]) {
    _fetchedRemoteModels[index].type = type;
  }
}

function filterImportModels() {
  renderImportModelsList();
}

function toggleSelectAllImportModels(checked) {
  for (var i = 0; i < _fetchedRemoteModels.length; i++) {
    _fetchedRemoteModels[i].checked = checked;
  }
  renderImportModelsList();
}

function updateImportSelectionSummary() {
  var selectedCount = 0;
  for (var i = 0; i < _fetchedRemoteModels.length; i++) {
    if (_fetchedRemoteModels[i].checked !== false) selectedCount++;
  }
  var sumEl = document.getElementById('importSummaryText');
  if (sumEl) sumEl.textContent = '共获取到 ' + _fetchedRemoteModels.length + ' 个模型，已选择 ' + selectedCount + ' 个';

  var btnConfirm = document.getElementById('btnConfirmImport');
  if (btnConfirm) {
    btnConfirm.disabled = (selectedCount === 0);
    btnConfirm.style.opacity = (selectedCount === 0) ? '0.6' : '1';
    btnConfirm.textContent = '📥 确认导入所选模型 (' + selectedCount + ')';
  }
}

async function confirmImportSelectedModels() {
  var selected = [];
  for (var i = 0; i < _fetchedRemoteModels.length; i++) {
    if (_fetchedRemoteModels[i].checked !== false) {
      selected.push(_fetchedRemoteModels[i]);
    }
  }

  if (selected.length === 0) {
    showToast('⚠️ 请至少勾选一个要导入的模型');
    return;
  }

  var baseUrl = (document.getElementById('importBaseUrl').value || '').trim();
  var apiKey = (document.getElementById('importApiKey').value || '').trim();
  var protocol = (document.getElementById('importProtocol').value || 'OpenAI 兼容协议').trim();
  var provider = (document.getElementById('importProvider').value || '').trim() || '自定义';

  var chatUrl = _remoteSuggestedChatUrl || baseUrl;
  if (!chatUrl.includes('/chat/completions') && !chatUrl.includes('/v1/chat/completions')) {
    if (chatUrl.endsWith('/v1')) chatUrl += '/chat/completions';
    else if (!chatUrl.endsWith('/models')) chatUrl += '/v1/chat/completions';
  }

  var currentModels = getModels();
  var addedCount = 0;
  var updatedCount = 0;

  for (var j = 0; j < selected.length; j++) {
    var sm = selected[j];
    var slug = sm.id;
    var type = sm.type || 'text';

    var pClean = provider.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
    var sClean = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';
    var targetId = pClean + '-' + sClean;

    var foundIndex = -1;
    for (var mIdx = 0; mIdx < currentModels.length; mIdx++) {
      if (currentModels[mIdx].id === targetId || currentModels[mIdx].model === slug) {
        foundIndex = mIdx;
        break;
      }
    }

    var modelItem = {
      id: targetId,
      name: (provider ? provider + ' · ' : '') + slug,
      provider: provider,
      baseUrl: chatUrl,
      protocol: protocol,
      type: type,
      model: slug,
      status: 'active',
      apiKey: apiKey
    };

    if (foundIndex >= 0) {
      currentModels[foundIndex] = Object.assign(currentModels[foundIndex], modelItem);
      updatedCount++;
    } else {
      currentModels.push(modelItem);
      addedCount++;
    }
  }

  saveModels(currentModels);
  modelsCache = currentModels;

  try {
    await syncProjectConfig('models', { models: currentModels, deletedIds: getDeletedModelIds() });
    closeImportModelsModal();
    renderModelList();
    if (typeof refreshAllModelPickers === 'function') refreshAllModelPickers();
    showToast('🎉 成功导入 ' + (addedCount + updatedCount) + ' 个模型（新增 ' + addedCount + '，更新 ' + updatedCount + '）！配置已实时生效');
  } catch (e) {
    console.error('[ImportModelsSync]', e);
    closeImportModelsModal();
    renderModelList();
    if (typeof refreshAllModelPickers === 'function') refreshAllModelPickers();
    showToast('⚠️ 模型已成功导入浏览器本地，但持久化到服务器异常：' + ((e && e.message) || '未知错误'));
  }
}

async function fetchModelsForEditModal() {
  var baseUrl = (document.getElementById('modelEditBaseUrl').value || '').trim();
  var apiKey = (document.getElementById('modelEditApiKey').value || '').trim();
  var protocol = (document.getElementById('modelEditProtocol').value || 'OpenAI 兼容协议').trim();
  var btn = document.getElementById('btnFetchSingleModels');
  var input = document.getElementById('modelEditModel');

  if (!baseUrl) {
    showToast('⚠️ 请先填写上面的 Base URL');
    return;
  }

  btn.disabled = true;
  var origText = btn.textContent;
  btn.textContent = '获取中...';

  try {
    var resp = await fetch('/api/models/fetch_remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: baseUrl, api_key: apiKey, protocol: protocol })
    });
    var data = await resp.json();
    if (!resp.ok || !data.success) {
      showToast('❌ 获取失败：' + ((data && data.error) || '未知错误'));
      return;
    }

    var list = data.models || [];
    if (list.length === 0) {
      showToast('⚠️ 未从该端点找到可用模型');
      return;
    }

    var datalistId = 'modelEditDatalist';
    var dl = document.getElementById(datalistId);
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = datalistId;
      document.body.appendChild(dl);
    }
    var dlHtml = '';
    for (var i = 0; i < list.length; i++) {
      dlHtml += '<option value="' + escapeHtml(list[i].id) + '">' + escapeHtml(list[i].id) + ' (' + list[i].type + ')</option>';
    }
    dl.innerHTML = dlHtml;
    input.setAttribute('list', datalistId);

    if (!input.value && list[0]) {
      input.value = list[0].id;
    }

    showToast('✅ 成功匹配 ' + list.length + ' 个模型！可直接从下拉提示中选择');
  } catch (err) {
    showToast('❌ 请求失败：' + ((err && err.message) || '网络异常'));
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}


// 弹窗关闭：点击背景
document.getElementById('promptEditModal').addEventListener('click', function(e) {
  if (e.target === this) closePromptEdit();
});

// ============ 大模型配置管理 ============
var defaultModels = [
{
  "id": "ark-plan-text",
  "name": "火山方舟 Agent Plan（文本+图片理解）",
  "provider": "字节跳动火山方舟",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions",
  "protocol": "OpenAI 兼容协议",
  "type": "text",
  "model": "ark-code-latest",
  "status": "active",
  "apiKey": ""
},
{
  "id": "ark-text",
  "name": "火山方舟 Coding Plan（订阅已过期）",
  "provider": "字节跳动火山方舟",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
  "protocol": "OpenAI 兼容协议",
  "type": "text",
  "status": "disabled",
  "apiKey": ARK_API_KEY
},
{
  "id": "minimax-text",
  "name": "MiniMax Claude 2.7",
  "provider": "MiniMax (海螺AI)",
  "baseUrl": "https://api.minimaxi.com/anthropic/v1/messages",
  "protocol": "Anthropic Messages API",
  "type": "text",
  "status": "active",
  "apiKey": MM_API_KEY
},
{
  "id": "ark-image",
  "name": "火山方舟 Seedream 4.0",
  "provider": "字节跳动火山方舟",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/v3/images/generations",
  "protocol": "OpenAI 兼容协议",
  "type": "image",
  "status": "active",
  "apiKey": ARK_API_KEY
},
{
  "id": "minimax-image",
  // 实测 status_code 2056「已达到 Token Plan 用量上限」，出不了图。
  // 不删掉是因为充值后就能用，改回 active 即可。
  "name": "MiniMax Image-01（额度已用尽）",
  "provider": "MiniMax (海螺AI)",
  "baseUrl": "https://api.minimaxi.com/v1/image_generation",
  "protocol": "MiniMax 原生协议",
  "type": "image",
  "status": "disabled",
  "apiKey": MM_API_KEY
},
{
  // 实测该 key 的套餐不含 T2V-01（status_code 2061 "your current token plan not support model"），
  // 置为 disabled 免得用户选了必然失败；账号开通后改回 active 即可
  "id": "minimax-video",
  "name": "MiniMax T2V-01（套餐未开通）",
  "provider": "MiniMax (海螺AI)",
  "baseUrl": "https://api.minimaxi.com/v1/video_generation",
  "protocol": "MiniMax 原生协议",
  "type": "video",
  "status": "disabled",
  "apiKey": MM_API_KEY
},
{
  // 实测提交任务返回 HTTP 402 Payment Required（账号欠费/未充值），同样先禁用
  "id": "hunyuan-video",
  "name": "腾讯混元 hy-video-1.5（账号欠费）",
  "provider": "腾讯混元",
  "baseUrl": "https://tokenhub.tencentmaas.com/v1/api/video/submit",
  "protocol": "腾讯混元 API",
  "type": "video",
  "status": "disabled",
  "apiKey": HY_API_KEY
},
{
  "id": "hunyuan-image",
  // 实测该端点返回 404 page not found（腾讯 tokenhub 已废弃此路径）
  "name": "腾讯混元 Image（端点已失效）",
  "provider": "腾讯混元",
  "baseUrl": "https://tokenhub.tencentmaas.com/v1/api/image/generate",
  "protocol": "腾讯混元 API",
  "type": "image",
  "status": "disabled",
  "apiKey": HY_API_KEY
},
{
  "id": "agnes-image",
  // 实测直连厂商 90 秒无响应；恢复后改回 active
  "name": "Agnes AI Image 2.1 Flash（厂商超时）",
  "provider": "Agnes AI",
  "baseUrl": "https://apihub.agnes-ai.com/v1/images/generations",
  "protocol": "OpenAI 兼容协议",
  "type": "image",
  "status": "disabled",
  "apiKey": AGNES_API_KEY
},
{
  "id": "agnes-video",
  "name": "Agnes AI Video V2.0",
  "provider": "Agnes AI",
  "baseUrl": "https://apihub.agnes-ai.com/v1/videos",
  "protocol": "OpenAI 兼容协议",
  "type": "video",
  "status": "active",
  "apiKey": AGNES_API_KEY
},
{
  "id": "agnes-video-25",
  // 2026-08-24 复测：厂商侧**已上线**（不再是 8-19 那次的 503 model_not_found，
  // GET /v1/models 里现在有 agnes-video-2.5），但撞上账号余额 ——
  // POST /v1/videos → HTTP 403 {"code":"insufficient_user_quota",
  //   "message":"预扣费额度失败, 用户剩余额度: ＄0.100000, 需要预扣费额度: ＄0.125000"}
  // 单次 2.5 视频 $0.125，账号只剩 $0.10。禁用理由已从"厂商未上线"改成"账号余额不足"。
  // 充值后在「大模型配置」把状态改回 active 即可，请求体已按新 schema 接对（见
  // callAgnesVideo25：seconds 必须是字符串，mode 必填）。
  "name": "Agnes AI Video 2.5（账号余额不足）",
  "provider": "Agnes AI",
  "baseUrl": "https://apihub.agnes-ai.com/v1/videos",
  "protocol": "OpenAI Videos 兼容协议",
  "type": "video",
  "status": "disabled",
  "apiKey": AGNES_API_KEY
},
{
  "id": "seedance-mini-video",
  "name": "Seedance 2 Mini",
  "provider": "ByteDance (AggregateAPI)",
  "baseUrl": "https://aaapi.togomol.com/api/v1/tasks",
  "protocol": "AggregateAPI 异步任务",
  "type": "video",
  "status": "active",
  "apiKey": SEEDANCE_MINI_API_KEY
}
];

// 用户删除的默认模型 id 列表（缓存 + 后端持久化，随 models 一起存）
window._userDeletedModels = null;
function getDeletedModelIds() {
  return window._userDeletedModels || [];
}

function saveDeletedModelIds(ids) {
  window._userDeletedModels = ids || [];
  // 与 models 一起推送（saveModels 会带上 deletedIds）
  if (window.currentUser && modelsCache) saveModels(modelsCache);
}

function mergeModelDefaults(savedModels) {
  var removedIds = { 'seedance-video': true };
  var deletedIds = getDeletedModelIds();
  for (var x = 0; x < deletedIds.length; x++) removedIds[deletedIds[x]] = true;
  var defaultsById = {};
  for (var i = 0; i < defaultModels.length; i++) defaultsById[defaultModels[i].id] = defaultModels[i];

  var merged = [];
  if (Array.isArray(savedModels)) {
    for (var j = 0; j < savedModels.length; j++) {
      var saved = savedModels[j];
      if (!saved || removedIds[saved.id]) continue;
      if (defaultsById[saved.id]) {
        var model = JSON.parse(JSON.stringify(defaultsById[saved.id]));
        model.name = saved.name || model.name;
        model.baseUrl = saved.baseUrl || model.baseUrl;
        model.apiKey = saved.apiKey || model.apiKey;
        model.protocol = saved.protocol || model.protocol;
        model.status = saved.status || model.status;
        merged.push(model);
      } else {
        merged.push(saved);
      }
    }
  }
  var existingIds = {};
  for (var k = 0; k < merged.length; k++) existingIds[merged[k].id] = true;
  for (var d = 0; d < defaultModels.length; d++) {
    if (!existingIds[defaultModels[d].id] && !removedIds[defaultModels[d].id]) merged.push(JSON.parse(JSON.stringify(defaultModels[d])));
  }
  saveModels(merged);
  return merged;
}

// 用户模型缓存（bootAppData 时从 /api/data/models 预载）
window._userModelsCache = null;

function loadModels() {
  // 已登录：模型完全按用户后端数据（可能为空），不注入默认，保证隔离
  if (window._userModelsLoaded) {
    return Array.isArray(window._userModelsCache) ? JSON.parse(JSON.stringify(window._userModelsCache)) : [];
  }
  // 未登录/未加载：返回默认集（仅用于占位，不会被保存）
  return JSON.parse(JSON.stringify(defaultModels));
}

function normalizeSeedanceTaskUrl(url) {
  var u = (url || '').replace(/\/$/, '');
  if (u.indexOf('/api/seedance_mini') === 0) return u;
  if (u && !/\/tasks$/.test(u)) u += '/tasks';
  return u || SEEDANCE_MINI_API_URL;
}

function getModelRuntimeConfig(id, fallback) {
  var cfg = Object.assign({}, fallback || {});
  try {
    var models = getModels();
    for (var i = 0; i < models.length; i++) {
      if (models[i].id === id) {
        cfg.baseUrl = models[i].baseUrl || cfg.baseUrl;
        cfg.apiKey = models[i].apiKey || cfg.apiKey;
        cfg.protocol = models[i].protocol || cfg.protocol;
        if (models[i].model) cfg.model = models[i].model;
        if (models[i].providerSlug) cfg.providerSlug = models[i].providerSlug;
        break;
      }
    }
  } catch(e) {}
  return cfg;
}

function saveModels(models) {
  window._userModelsCache = models;
  if (window.currentUser) {
    fetch('/api/data/models', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models: models })
    }).catch(function(e) { console.warn('[saveModels] push failed', e && e.message); });
  }
}

var modelsCache = null;
function getModels() {
  if (!modelsCache) modelsCache = loadModels();
  return modelsCache;
}

function maskApiKey(key) {
  // 内置模型的 key 现在一律为空（密钥只在服务端）。这里不能显示"未配置" ——
  // 那会让人以为模型坏了，跑去手填一个 key，反而把密钥又灌回浏览器。
  if (!key) return '服务端托管';
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

var typeIcons = { text: '📝', image: '🖼️', video: '🎬' };
var typeLabels = { text: '文本生成', image: '图片生成', video: '视频生成' };
var statusColors = { active: '#10b981', inactive: '#ef4444' };

function renderModelList() {
  var models = getModels();
  var list = document.getElementById('modelList');
  
  var html = '';
  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    var icon = typeIcons[m.type] || '🤖';
    var label = typeLabels[m.type] || m.type;
    html += '<div style="background:var(--bg-tertiary);border:1px solid var(--border);border-radius:14px;padding:20px;transition:all 0.2s;" onmouseenter="this.style.borderColor=\'var(--accent)\'" onmouseleave="this.style.borderColor=\'var(--border)\'">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<span style="font-size:24px;">' + icon + '</span>'
      + '<div>'
      + '<div style="font-size:16px;font-weight:600;color:var(--text-primary);">' + m.name + '</div>'
      + '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + m.provider + '</div>'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<span style="font-size:11px;background:' + statusColors[m.status] + '20;color:' + statusColors[m.status] + ';padding:2px 10px;border-radius:8px;font-weight:500;">' + label + '</span>'
      + '<button class="btn btn-outline btn-sm" onclick="editModel(\'' + m.id + '\')" style="white-space:nowrap;">⚙️ 编辑</button>'
      + '<button class="btn btn-outline btn-sm" onclick="deleteModel(\'' + m.id + '\')" style="white-space:nowrap;color:#ef4444;border-color:#ef444455;">删除</button>'
      + '</div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">'
      + '<div><span style="color:var(--text-secondary);">Base URL：</span><span style="color:var(--text-primary);word-break:break-all;font-family:monospace;">' + m.baseUrl + '</span></div>'
      + '<div><span style="color:var(--text-secondary);">API Key：</span><span style="color:var(--text-primary);font-family:monospace;">' + maskApiKey(m.apiKey) + '</span></div>'
      + '<div><span style="color:var(--text-secondary);">协议类型：</span><span style="color:var(--text-primary);">' + m.protocol + '</span></div>'
      + '<div><span style="color:var(--text-secondary);">能力类型：</span><span style="color:var(--text-primary);">' + label + '</span></div>'
      + '</div>'
      + '</div>';
  }
  list.innerHTML = html;
}

var editingModelId = null;  // null = 添加模式；否则为被编辑模型 id

function _setModelModalMode(isAdd) {
  var title = document.getElementById('modelEditTitle');
  if (title) title.textContent = isAdd ? t('models.modal.title_add', '添加模型') : t('models.modal.title_edit', '编辑模型配置');
}

function openAddModel() {
  editingModelId = null;
  document.getElementById('modelEditName').value = '';
  document.getElementById('modelEditProvider').value = '';
  document.getElementById('modelEditType').value = 'text';
  document.getElementById('modelEditProtocol').value = 'OpenAI 兼容协议';
  document.getElementById('modelEditBaseUrl').value = '';
  document.getElementById('modelEditModel').value = '';
  document.getElementById('modelEditStatus').value = 'active';
  document.getElementById('modelEditApiKey').value = '';
  document.getElementById('modelEditApiKey').type = 'password';
  document.getElementById('toggleKeyBtn').textContent = '👁 显示';
  _setModelModalMode(true);
  var mtr = document.getElementById('modelTestResult'); if (mtr) mtr.textContent = '';
  var modal = document.getElementById('modelEditModal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function editModel(id) {
  var models = getModels();
  var m = null;
  for (var i = 0; i < models.length; i++) {
    if (models[i].id === id) { m = models[i]; break; }
  }
  if (!m) return;
  editingModelId = id;
  document.getElementById('modelEditName').value = m.name || '';
  document.getElementById('modelEditProvider').value = m.provider || '';
  document.getElementById('modelEditType').value = m.type || 'text';
  document.getElementById('modelEditProtocol').value = m.protocol || 'OpenAI 兼容协议';
  document.getElementById('modelEditBaseUrl').value = m.baseUrl || '';
  document.getElementById('modelEditModel').value = m.model || '';
  document.getElementById('modelEditStatus').value = m.status || 'active';
  document.getElementById('modelEditApiKey').value = m.apiKey || '';
  document.getElementById('modelEditApiKey').type = 'password';
  document.getElementById('toggleKeyBtn').textContent = '👁 显示';
  _setModelModalMode(false);
  var mtr2 = document.getElementById('modelTestResult'); if (mtr2) mtr2.textContent = '';
  var modal = document.getElementById('modelEditModal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModelEdit() {
  document.getElementById('modelEditModal').style.display = 'none';
  document.body.style.overflow = '';
  editingModelId = null;
  var r = document.getElementById('modelTestResult');
  if (r) { r.textContent = ''; }
}

// 测试大模型 API 连通性：用弹窗当前填写的 URL/协议/Key 发一个最小探测请求
async function testModelConnection() {
  var name = document.getElementById('modelEditName').value.trim();
  var protocol = document.getElementById('modelEditProtocol').value;
  var type = document.getElementById('modelEditType').value;
  var baseUrl = document.getElementById('modelEditBaseUrl').value.trim();
  var modelSlug = document.getElementById('modelEditModel').value.trim();
  var apiKey = document.getElementById('modelEditApiKey').value.trim();
  var resEl = document.getElementById('modelTestResult');
  var btn = document.getElementById('btnTestModel');

  function show(msg, color) { if (resEl) { resEl.textContent = msg; resEl.style.color = color; } }

  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) { show('⚠️ 请先填写合法 Base URL', '#f59e0b'); return; }

  btn.disabled = true;
  var orig = btn.textContent;
  btn.innerHTML = '<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:currentColor;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 测试中...';
  show('正在探测连通性...', 'var(--text-secondary)');

  // 构造最小探测请求体（按协议区分）
  var isAnthropic = /anthropic/i.test(protocol || '');
  var isText = (type === 'text');
  var probeBody, authType;
  if (isText && isAnthropic) {
    authType = 'x-api-key';
    probeBody = { model: modelSlug || 'claude-3-haiku', max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] };
  } else if (isText) {
    authType = 'bearer';
    probeBody = { model: modelSlug || 'gpt-4o-mini', max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] };
  } else {
    // 图片/视频：只做一次轻量 POST 探活，能连上且鉴权通过即算成功（不真生成）
    authType = 'bearer';
    probeBody = { model: modelSlug || '', prompt: 'ping', n: 1 };
  }

  try {
    var t0 = Date.now();
    var resp = await fetch('/api/custom_model', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: baseUrl, method: 'POST',
        auth_type: authType, auth_key: apiKey,
        headers: isAnthropic ? { 'anthropic-version': '2023-06-01' } : {},
        body: probeBody
      })
    });
    var ms = Date.now() - t0;
    var text = await resp.text();
    var data = {};
    try { data = JSON.parse(text); } catch (e) {}

    if (resp.status >= 200 && resp.status < 300) {
      show('✅ 连接成功（HTTP ' + resp.status + ' · ' + ms + 'ms）', '#22c55e');
    } else if (resp.status === 400 || resp.status === 422) {
      // 4xx 参数类错误：说明网络+鉴权通了，只是探测体不完整 → 视为“可连通”
      show('✅ 可连通（鉴权通过，HTTP ' + resp.status + '），保存后按真实参数调用', '#22c55e');
    } else if (resp.status === 401 || resp.status === 403) {
      show('🔑 鉴权失败（HTTP ' + resp.status + '）：请检查 API Key', '#ef4444');
    } else if (resp.status === 404) {
      show('❓ 端点 404：请检查 Base URL 路径是否正确', '#ef4444');
    } else if (resp.status === 429) {
      show('⏳ 429 限流：Key 有效但当前请求过多，稍后重试', '#f59e0b');
    } else {
      var em = (data && data.error) ? String(data.error).slice(0, 80) : ('HTTP ' + resp.status);
      show('⚠️ 返回异常：' + em, '#f59e0b');
    }
  } catch (e) {
    show('❌ 无法连接：' + (e && e.message ? e.message : '网络错误 / URL 不可达'), '#ef4444');
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function toggleApiKeyVisibility() {
  var inp = document.getElementById('modelEditApiKey');
  var btn = document.getElementById('toggleKeyBtn');
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🙈 隐藏';
  } else {
    inp.type = 'password';
    btn.textContent = '👁 显示';
  }
}

async function saveModelEdit() {
  var name = document.getElementById('modelEditName').value.trim();
  var provider = document.getElementById('modelEditProvider').value.trim();
  var type = document.getElementById('modelEditType').value;
  var protocol = document.getElementById('modelEditProtocol').value;
  var baseUrl = document.getElementById('modelEditBaseUrl').value.trim();
  var modelSlug = document.getElementById('modelEditModel').value.trim();
  var status = document.getElementById('modelEditStatus').value;
  var apiKey = document.getElementById('modelEditApiKey').value.trim();

  if (!name) { showToast('⚠️ 请填写模型名称'); return; }
  if (!baseUrl) { showToast('⚠️ 请填写 Base URL'); return; }
  if (!/^https?:\/\//i.test(baseUrl)) { showToast('⚠️ Base URL 必须以 http(s):// 开头'); return; }

  var models = getModels();
  var isAdd = !editingModelId;
  if (isAdd) {
    // 生成唯一 id：type-provider-slug
    var slug = (provider || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';
    var newId = type + '-' + slug;
    var suffix = 2;
    var taken = {};
    for (var x = 0; x < models.length; x++) taken[models[x].id] = true;
    var baseId = newId;
    while (taken[newId]) { newId = baseId + '-' + (suffix++); }
    models.push({
      id: newId,
      name: name,
      provider: provider || name,
      baseUrl: baseUrl,
      protocol: protocol,
      type: type,
      model: modelSlug,
      status: status,
      apiKey: apiKey
    });
  } else {
    for (var i = 0; i < models.length; i++) {
      if (models[i].id === editingModelId) {
        models[i].name = name;
        models[i].provider = provider || models[i].provider;
        models[i].type = type;
        models[i].baseUrl = baseUrl;
        models[i].apiKey = apiKey;
        models[i].protocol = protocol;
        models[i].model = modelSlug;
        models[i].status = status;
        break;
      }
    }
  }
  saveModels(models);
  modelsCache = models;
  try {
    await syncProjectConfig('models', { models: models, deletedIds: getDeletedModelIds() });
    closeModelEdit();
    renderModelList();
    if (typeof refreshAllModelPickers === 'function') refreshAllModelPickers();
    showToast(isAdd ? '✅ 模型已添加并写入 index.html 和 server.py，即时生效' : '✅ 模型配置已保存，并已同步写入 index.html 和 server.py');
  } catch (e) {
    console.error('[SyncModels]', e);
    closeModelEdit();
    renderModelList();
    if (typeof refreshAllModelPickers === 'function') refreshAllModelPickers();
    showToast('⚠️ 模型已保存到浏览器，但写入源码失败：' + ((e && e.message) || '未知错误'));
  }
}

async function deleteModel(id) {
  var models = getModels();
  var target = null;
  for (var i = 0; i < models.length; i++) {
    if (models[i].id === id) { target = models[i]; break; }
  }
  if (!target) return;
  if (!confirm('确定要删除模型配置：' + target.name + ' 吗？')) return;
  models = models.filter(function(m) { return m.id !== id; });
  var deletedIds = getDeletedModelIds();
  if (deletedIds.indexOf(id) === -1) {
    deletedIds.push(id);
    saveDeletedModelIds(deletedIds);
  }
  saveModels(models);
  modelsCache = models;
  try {
    await syncProjectConfig('models', { models: models, deletedIds: deletedIds });
    renderModelList();
    showToast('✅ 模型配置已删除，并已同步写入 index.html 和 server.py');
  } catch (e) {
    renderModelList();
    showToast('⚠️ 模型已从页面删除，但写入源码失败：' + ((e && e.message) || '未知错误'));
  }
}


// ============ 大模型一键导入 (通过 API /v1/models 探测获取) ============

var IMPORT_PRESETS = {
  deepseek: {
    provider: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'OpenAI 兼容协议'
  },
  siliconflow: {
    provider: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    protocol: 'OpenAI 兼容协议'
  },
  dashscope: {
    provider: '阿里云通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'OpenAI 兼容协议'
  },
  kimi: {
    provider: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    protocol: 'OpenAI 兼容协议'
  },
  zhipu: {
    provider: '智谱清言 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'OpenAI 兼容协议'
  },
  openai: {
    provider: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'OpenAI 兼容协议'
  },
  oneapi: {
    provider: 'OneAPI 中转',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'OpenAI 兼容协议'
  },
  ollama: {
    provider: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    protocol: 'OpenAI 兼容协议'
  }
};

var _fetchedRemoteModels = [];
var _remoteSuggestedChatUrl = '';

function openImportModelsModal() {
  var modal = document.getElementById('importModelsModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  var status = document.getElementById('importFetchStatus');
  if (status) status.textContent = '';
}

function closeImportModelsModal() {
  var modal = document.getElementById('importModelsModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function applyImportPreset(key) {
  var p = IMPORT_PRESETS[key];
  if (!p) return;
  var bUrl = document.getElementById('importBaseUrl');
  var prov = document.getElementById('importProvider');
  var proto = document.getElementById('importProtocol');
  if (bUrl) bUrl.value = p.baseUrl;
  if (prov) prov.value = p.provider;
  if (proto) proto.value = p.protocol;
  var status = document.getElementById('importFetchStatus');
  if (status) {
    status.textContent = '已填充 ' + p.provider + ' 预设配置，请填写对应 API Key 后点击获取';
    status.style.color = 'var(--accent-light)';
  }
}

function toggleImportApiKeyVisibility() {
  var inp = document.getElementById('importApiKey');
  var btn = document.getElementById('toggleImportKeyBtn');
  if (!inp || !btn) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🙈 隐藏';
  } else {
    inp.type = 'password';
    btn.textContent = '👁 显示';
  }
}

async function fetchRemoteModels() {
  var baseUrl = (document.getElementById('importBaseUrl').value || '').trim();
  var apiKey = (document.getElementById('importApiKey').value || '').trim();
  var protocol = (document.getElementById('importProtocol').value || 'OpenAI 兼容协议').trim();
  var provider = (document.getElementById('importProvider').value || '').trim();
  var statusEl = document.getElementById('importFetchStatus');
  var btn = document.getElementById('btnFetchRemoteModels');

  if (!baseUrl) {
    if (statusEl) { statusEl.textContent = '⚠️ 请先填写 Base URL'; statusEl.style.color = '#ef4444'; }
    return;
  }

  btn.disabled = true;
  var origHtml = btn.innerHTML;
  btn.innerHTML = '<div style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:currentColor;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> 正在拉取中...';
  if (statusEl) { statusEl.textContent = '正在连接远端 API 获取模型列表...'; statusEl.style.color = 'var(--text-secondary)'; }

  try {
    var resp = await fetch('/api/models/fetch_remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_url: baseUrl,
        api_key: apiKey,
        protocol: protocol
      })
    });
    var data = await resp.json();

    if (!resp.ok || !data.success) {
      var errMsg = (data && data.error) || ('HTTP ' + resp.status);
      if (statusEl) { statusEl.textContent = '❌ ' + errMsg; statusEl.style.color = '#ef4444'; }
      return;
    }

    _fetchedRemoteModels = data.models || [];
    _remoteSuggestedChatUrl = data.suggested_chat_endpoint || baseUrl;

    if (!provider && data.detected_provider) {
      document.getElementById('importProvider').value = data.detected_provider;
    }

    if (statusEl) {
      statusEl.textContent = '✅ 成功获取 ' + _fetchedRemoteModels.length + ' 个模型';
      statusEl.style.color = '#22c55e';
    }

    document.getElementById('importResultsPanel').style.display = 'flex';
    renderImportModelsList();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = '❌ 连接失败：' + ((err && err.message) || '网络错误');
      statusEl.style.color = '#ef4444';
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHtml;
  }
}

function renderImportModelsList() {
  var box = document.getElementById('importModelsListBox');
  if (!box) return;

  var currentModels = getModels();
  var existingSlugs = {};
  for (var i = 0; i < currentModels.length; i++) {
    if (currentModels[i].model) existingSlugs[currentModels[i].model.toLowerCase()] = true;
    if (currentModels[i].id) existingSlugs[currentModels[i].id.toLowerCase()] = true;
  }

  var searchKw = (document.getElementById('importSearchInput').value || '').trim().toLowerCase();

  var html = '';
  var visibleCount = 0;
  var selectedCount = 0;

  for (var i = 0; i < _fetchedRemoteModels.length; i++) {
    var m = _fetchedRemoteModels[i];
    var idLower = m.id.toLowerCase();
    if (searchKw && idLower.indexOf(searchKw) === -1 && (m.name || '').toLowerCase().indexOf(searchKw) === -1) {
      continue;
    }

    visibleCount++;
    var isChecked = m.checked !== false;
    if (isChecked) selectedCount++;

    var isExisting = !!existingSlugs[idLower];
    var tagExisting = isExisting
      ? '<span style="font-size:11px;background:rgba(234,179,8,0.15);color:#eab308;padding:2px 8px;border-radius:6px;border:1px solid rgba(234,179,8,0.3);">已在配置中</span>'
      : '<span style="font-size:11px;background:rgba(34,197,94,0.15);color:#22c55e;padding:2px 8px;border-radius:6px;border:1px solid rgba(34,197,94,0.3);">新模型</span>';

    html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:10px 14px;transition:all 0.2s;">'
      + '<div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">'
      + '<input type="checkbox" style="cursor:pointer;width:16px;height:16px;accent-color:var(--accent);" '
      + (isChecked ? 'checked ' : '')
      + 'onchange="onToggleImportModelItem(' + i + ', this.checked)"/>'
      + '<div style="min-width:0;flex:1;">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      + '<span style="font-size:13px;font-weight:600;color:var(--text-primary);font-family:monospace;word-break:break-all;">' + escapeHtml(m.id) + '</span>'
      + tagExisting
      + '</div>'
      + (m.owned_by ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">所属：' + escapeHtml(m.owned_by) + '</div>' : '')
      + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'
      + '<select class="input" style="padding:3px 8px;font-size:12px;width:110px;" onchange="onChangeImportModelType(' + i + ', this.value)">'
      + '<option value="text"' + (m.type === 'text' ? ' selected' : '') + '>📝 文本模型</option>'
      + '<option value="image"' + (m.type === 'image' ? ' selected' : '') + '>🖼️ 图片模型</option>'
      + '<option value="video"' + (m.type === 'video' ? ' selected' : '') + '>🎬 视频模型</option>'
      + '</select>'
      + '</div>'
      + '</div>';
  }

  if (visibleCount === 0) {
    html = '<div style="text-align:center;padding:30px;color:var(--text-secondary);font-size:13px;">无匹配模型，请尝试更换搜索关键字</div>';
  }

  box.innerHTML = html;

  var sumEl = document.getElementById('importSummaryText');
  if (sumEl) sumEl.textContent = '共获取到 ' + _fetchedRemoteModels.length + ' 个模型，已选择 ' + selectedCount + ' 个';

  var btnConfirm = document.getElementById('btnConfirmImport');
  if (btnConfirm) {
    btnConfirm.disabled = (selectedCount === 0);
    btnConfirm.style.opacity = (selectedCount === 0) ? '0.6' : '1';
    btnConfirm.textContent = '📥 确认导入所选模型 (' + selectedCount + ')';
  }
}

function onToggleImportModelItem(index, checked) {
  if (_fetchedRemoteModels[index]) {
    _fetchedRemoteModels[index].checked = checked;
  }
  updateImportSelectionSummary();
}

function onChangeImportModelType(index, type) {
  if (_fetchedRemoteModels[index]) {
    _fetchedRemoteModels[index].type = type;
  }
}

function filterImportModels() {
  renderImportModelsList();
}

function toggleSelectAllImportModels(checked) {
  for (var i = 0; i < _fetchedRemoteModels.length; i++) {
    _fetchedRemoteModels[i].checked = checked;
  }
  renderImportModelsList();
}

function updateImportSelectionSummary() {
  var selectedCount = 0;
  for (var i = 0; i < _fetchedRemoteModels.length; i++) {
    if (_fetchedRemoteModels[i].checked !== false) selectedCount++;
  }
  var sumEl = document.getElementById('importSummaryText');
  if (sumEl) sumEl.textContent = '共获取到 ' + _fetchedRemoteModels.length + ' 个模型，已选择 ' + selectedCount + ' 个';

  var btnConfirm = document.getElementById('btnConfirmImport');
  if (btnConfirm) {
    btnConfirm.disabled = (selectedCount === 0);
    btnConfirm.style.opacity = (selectedCount === 0) ? '0.6' : '1';
    btnConfirm.textContent = '📥 确认导入所选模型 (' + selectedCount + ')';
  }
}

async function confirmImportSelectedModels() {
  var selected = [];
  for (var i = 0; i < _fetchedRemoteModels.length; i++) {
    if (_fetchedRemoteModels[i].checked !== false) {
      selected.push(_fetchedRemoteModels[i]);
    }
  }

  if (selected.length === 0) {
    showToast('⚠️ 请至少勾选一个要导入的模型');
    return;
  }

  var baseUrl = (document.getElementById('importBaseUrl').value || '').trim();
  var apiKey = (document.getElementById('importApiKey').value || '').trim();
  var protocol = (document.getElementById('importProtocol').value || 'OpenAI 兼容协议').trim();
  var provider = (document.getElementById('importProvider').value || '').trim() || '自定义';

  var chatUrl = _remoteSuggestedChatUrl || baseUrl;
  if (!chatUrl.includes('/chat/completions') && !chatUrl.includes('/v1/chat/completions')) {
    if (chatUrl.endsWith('/v1')) chatUrl += '/chat/completions';
    else if (!chatUrl.endsWith('/models')) chatUrl += '/v1/chat/completions';
  }

  var currentModels = getModels();
  var addedCount = 0;
  var updatedCount = 0;

  for (var j = 0; j < selected.length; j++) {
    var sm = selected[j];
    var slug = sm.id;
    var type = sm.type || 'text';

    var pClean = provider.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
    var sClean = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';
    var targetId = pClean + '-' + sClean;

    var foundIndex = -1;
    for (var mIdx = 0; mIdx < currentModels.length; mIdx++) {
      if (currentModels[mIdx].id === targetId || currentModels[mIdx].model === slug) {
        foundIndex = mIdx;
        break;
      }
    }

    var modelItem = {
      id: targetId,
      name: (provider ? provider + ' · ' : '') + slug,
      provider: provider,
      baseUrl: chatUrl,
      protocol: protocol,
      type: type,
      model: slug,
      status: 'active',
      apiKey: apiKey
    };

    if (foundIndex >= 0) {
      currentModels[foundIndex] = Object.assign(currentModels[foundIndex], modelItem);
      updatedCount++;
    } else {
      currentModels.push(modelItem);
      addedCount++;
    }
  }

  saveModels(currentModels);
  modelsCache = currentModels;

  try {
    await syncProjectConfig('models', { models: currentModels, deletedIds: getDeletedModelIds() });
    closeImportModelsModal();
    renderModelList();
    if (typeof refreshAllModelPickers === 'function') refreshAllModelPickers();
    showToast('🎉 成功导入 ' + (addedCount + updatedCount) + ' 个模型（新增 ' + addedCount + '，更新 ' + updatedCount + '）！配置已实时生效');
  } catch (e) {
    console.error('[ImportModelsSync]', e);
    closeImportModelsModal();
    renderModelList();
    if (typeof refreshAllModelPickers === 'function') refreshAllModelPickers();
    showToast('⚠️ 模型已成功导入浏览器本地，但持久化到服务器异常：' + ((e && e.message) || '未知错误'));
  }
}

async function fetchModelsForEditModal() {
  var baseUrl = (document.getElementById('modelEditBaseUrl').value || '').trim();
  var apiKey = (document.getElementById('modelEditApiKey').value || '').trim();
  var protocol = (document.getElementById('modelEditProtocol').value || 'OpenAI 兼容协议').trim();
  var btn = document.getElementById('btnFetchSingleModels');
  var input = document.getElementById('modelEditModel');

  if (!baseUrl) {
    showToast('⚠️ 请先填写上面的 Base URL');
    return;
  }

  btn.disabled = true;
  var origText = btn.textContent;
  btn.textContent = '获取中...';

  try {
    var resp = await fetch('/api/models/fetch_remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: baseUrl, api_key: apiKey, protocol: protocol })
    });
    var data = await resp.json();
    if (!resp.ok || !data.success) {
      showToast('❌ 获取失败：' + ((data && data.error) || '未知错误'));
      return;
    }

    var list = data.models || [];
    if (list.length === 0) {
      showToast('⚠️ 未从该端点找到可用模型');
      return;
    }

    var datalistId = 'modelEditDatalist';
    var dl = document.getElementById(datalistId);
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = datalistId;
      document.body.appendChild(dl);
    }
    var dlHtml = '';
    for (var i = 0; i < list.length; i++) {
      dlHtml += '<option value="' + escapeHtml(list[i].id) + '">' + escapeHtml(list[i].id) + ' (' + list[i].type + ')</option>';
    }
    dl.innerHTML = dlHtml;
    input.setAttribute('list', datalistId);

    if (!input.value && list[0]) {
      input.value = list[0].id;
    }

    showToast('✅ 成功匹配 ' + list.length + ' 个模型！可直接从下拉提示中选择');
  } catch (err) {
    showToast('❌ 请求失败：' + ((err && err.message) || '网络异常'));
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}


// 弹窗关闭：点击背景
document.getElementById('modelEditModal').addEventListener('click', function(e) {
  if (e.target === this) closeModelEdit();
});

// 导航到提示词/模型配置时自动渲染
var origScrollToSection = scrollToSection;
scrollToSection = function(section) {
  // 越权拦截：普通用户不能进受限区
  if (RESTRICTED_SECTIONS[section] && (!window.currentUser || window.currentUser.role !== 'admin')) {
    showToast(window.currentLang === 'en' ? 'Access denied' : '无权访问该模块');
    return;
  }
  origScrollToSection(section);
  if (section === 'prompts') {
    // 防浏览器把用户名/密码自动填进搜索框，导致提示词列表被过滤成空
    var _ps = document.getElementById('promptSearch');
    if (_ps && _ps.value && !_ps.dataset.userTyped) _ps.value = '';
    renderPromptList();
  }
  if (section === 'models') renderModelList();
  if (section === 'users') renderUsersTable();
  if (section === 'user-center') updateUserBadge();
};

init();


// ============ 显式导出所有全局方法至 window 作用域，确保内联 onclick 100% 可用 ============
if (typeof adminDeleteUser === 'function') window.adminDeleteUser = adminDeleteUser;
if (typeof adminResetPw === 'function') window.adminResetPw = adminResetPw;
if (typeof authLogin === 'function') window.authLogin = authLogin;
if (typeof authLogout === 'function') window.authLogout = authLogout;
if (typeof authRegister === 'function') window.authRegister = authRegister;
if (typeof cancelEditScript === 'function') window.cancelEditScript = cancelEditScript;
if (typeof classifyAndReply === 'function') window.classifyAndReply = classifyAndReply;
if (typeof clearCommentInput === 'function') window.clearCommentInput = clearCommentInput;
if (typeof clearIPStats === 'function') window.clearIPStats = clearIPStats;
if (typeof clearProductContext === 'function') window.clearProductContext = clearProductContext;
if (typeof clearSmartReplyInput === 'function') window.clearSmartReplyInput = clearSmartReplyInput;
if (typeof clearWorkspace === 'function') window.clearWorkspace = clearWorkspace;
if (typeof closeBindModal === 'function') window.closeBindModal = closeBindModal;
if (typeof closeDashboard === 'function') window.closeDashboard = closeDashboard;
if (typeof closeEditor === 'function') window.closeEditor = closeEditor;
if (typeof closeModelEdit === 'function') window.closeModelEdit = closeModelEdit;
if (typeof closePromptEdit === 'function') window.closePromptEdit = closePromptEdit;
if (typeof copyArticleHtml === 'function') window.copyArticleHtml = copyArticleHtml;
if (typeof copyDerivedComment === 'function') window.copyDerivedComment = copyDerivedComment;
if (typeof copyScript === 'function') window.copyScript = copyScript;
if (typeof copySmartReply === 'function') window.copySmartReply = copySmartReply;
if (typeof copySourcingTable === 'function') window.copySourcingTable = copySourcingTable;
if (typeof deleteAsset === 'function') window.deleteAsset = deleteAsset;
if (typeof deleteModel === 'function') window.deleteModel = deleteModel;
if (typeof editModel === 'function') window.editModel = editModel;
if (typeof editPrompt === 'function') window.editPrompt = editPrompt;
if (typeof editScript === 'function') window.editScript = editScript;
if (typeof editorApplyRich === 'function') window.editorApplyRich = editorApplyRich;
if (typeof execCommand === 'function') window.execCommand = execCommand;
if (typeof exportArticle === 'function') window.exportArticle = exportArticle;
if (typeof exportScript === 'function') window.exportScript = exportScript;
if (typeof exportVideo === 'function') window.exportVideo = exportVideo;
if (typeof exportVideoFallback === 'function') window.exportVideoFallback = exportVideoFallback;
if (typeof fillImagePromptByIndex === 'function') window.fillImagePromptByIndex = fillImagePromptByIndex;
if (typeof filterAssets === 'function') window.filterAssets = filterAssets;
if (typeof filterByCategory === 'function') window.filterByCategory = filterByCategory;
if (typeof fqClear === 'function') window.fqClear = fqClear;
if (typeof fqCopyAnswer === 'function') window.fqCopyAnswer = fqCopyAnswer;
if (typeof fqExportAll === 'function') window.fqExportAll = fqExportAll;
if (typeof fqExportOne === 'function') window.fqExportOne = fqExportOne;
if (typeof fqHandleImagePick === 'function') window.fqHandleImagePick = fqHandleImagePick;
if (typeof fqRemoveImage === 'function') window.fqRemoveImage = fqRemoveImage;
if (typeof fqSend === 'function') window.fqSend = fqSend;
if (typeof generateArticle === 'function') window.generateArticle = generateArticle;
if (typeof generateArticleText === 'function') window.generateArticleText = generateArticleText;
if (typeof generateFullVideo === 'function') window.generateFullVideo = generateFullVideo;
if (typeof generateImages === 'function') window.generateImages = generateImages;
if (typeof generateScript === 'function') window.generateScript = generateScript;
if (typeof generateVideo === 'function') window.generateVideo = generateVideo;
if (typeof getElementById === 'function') window.getElementById = getElementById;
if (typeof goBindStep1 === 'function') window.goBindStep1 = goBindStep1;
if (typeof goBindStep3 === 'function') window.goBindStep3 = goBindStep3;
if (typeof gotoAddModel === 'function') window.gotoAddModel = gotoAddModel;
if (typeof handleRefImageUpload === 'function') window.handleRefImageUpload = handleRefImageUpload;
if (typeof insertArticleImages === 'function') window.insertArticleImages = insertArticleImages;
if (typeof insertImage === 'function') window.insertImage = insertImage;
if (typeof loadCommentToInput === 'function') window.loadCommentToInput = loadCommentToInput;
if (typeof loadTrickyCommentToInput === 'function') window.loadTrickyCommentToInput = loadTrickyCommentToInput;
if (typeof onModelPickChange === 'function') window.onModelPickChange = onModelPickChange;
if (typeof onProductDigestEdit === 'function') window.onProductDigestEdit = onProductDigestEdit;
if (typeof open === 'function') window.open = open;
if (typeof openAddModel === 'function') window.openAddModel = openAddModel;
if (typeof openBindModal === 'function') window.openBindModal = openBindModal;
if (typeof openDashboard === 'function') window.openDashboard = openDashboard;
if (typeof openEditor === 'function') window.openEditor = openEditor;
if (typeof openFullArticleEditor === 'function') window.openFullArticleEditor = openFullArticleEditor;
if (typeof openSource === 'function') window.openSource = openSource;
if (typeof optimizeImagePrompt === 'function') window.optimizeImagePrompt = optimizeImagePrompt;
if (typeof optimizeVideoPrompt === 'function') window.optimizeVideoPrompt = optimizeVideoPrompt;
if (typeof parseInt === 'function') window.parseInt = parseInt;
if (typeof publishArticle === 'function') window.publishArticle = publishArticle;
if (typeof publishVideo === 'function') window.publishVideo = publishVideo;
if (typeof refreshHotComments === 'function') window.refreshHotComments = refreshHotComments;
if (typeof refreshHotspots === 'function') window.refreshHotspots = refreshHotspots;
if (typeof regenerateImages === 'function') window.regenerateImages = regenerateImages;
if (typeof removeRefImage === 'function') window.removeRefImage = removeRefImage;
if (typeof renderPromptList === 'function') window.renderPromptList = renderPromptList;
if (typeof replyComment === 'function') window.replyComment = replyComment;
if (typeof resetAllPrompts === 'function') window.resetAllPrompts = resetAllPrompts;
if (typeof resetProductDigest === 'function') window.resetProductDigest = resetProductDigest;
if (typeof retryArticleImages === 'function') window.retryArticleImages = retryArticleImages;
if (typeof runSourcing === 'function') window.runSourcing = runSourcing;
if (typeof saveArticleFull === 'function') window.saveArticleFull = saveArticleFull;
if (typeof saveModelEdit === 'function') window.saveModelEdit = saveModelEdit;
if (typeof savePromptEdit === 'function') window.savePromptEdit = savePromptEdit;
if (typeof saveScript === 'function') window.saveScript = saveScript;
if (typeof scrapeProduct === 'function') window.scrapeProduct = scrapeProduct;
if (typeof scrollToSection === 'function') window.scrollToSection = scrollToSection;
if (typeof searchWebHotspots === 'function') window.searchWebHotspots = searchWebHotspots;
if (typeof selectBindPlatform === 'function') window.selectBindPlatform = selectBindPlatform;
if (typeof selectPlatform === 'function') window.selectPlatform = selectPlatform;
if (typeof selectReplyPlatform === 'function') window.selectReplyPlatform = selectReplyPlatform;
if (typeof selectVideoPlatform === 'function') window.selectVideoPlatform = selectVideoPlatform;
if (typeof setModuleModelDefault === 'function') window.setModuleModelDefault = setModuleModelDefault;
if (typeof startArticleFromHotspot === 'function') window.startArticleFromHotspot = startArticleFromHotspot;
if (typeof startArticleFromProduct === 'function') window.startArticleFromProduct = startArticleFromProduct;
if (typeof startBoomAnalysis === 'function') window.startBoomAnalysis = startBoomAnalysis;
if (typeof startCommentDerivation === 'function') window.startCommentDerivation = startCommentDerivation;
if (typeof startScriptFromHotspot === 'function') window.startScriptFromHotspot = startScriptFromHotspot;
if (typeof startScriptFromProduct === 'function') window.startScriptFromProduct = startScriptFromProduct;
if (typeof stopPropagation === 'function') window.stopPropagation = stopPropagation;
if (typeof switchAuthTab === 'function') window.switchAuthTab = switchAuthTab;
if (typeof switchBgm === 'function') window.switchBgm = switchBgm;
if (typeof switchSearchSource === 'function') window.switchSearchSource = switchSearchSource;
if (typeof testModelConnection === 'function') window.testModelConnection = testModelConnection;
if (typeof toggleApiKeyVisibility === 'function') window.toggleApiKeyVisibility = toggleApiKeyVisibility;
if (typeof toggleVoiceInput === 'function') window.toggleVoiceInput = toggleVoiceInput;
if (typeof tsCopy === 'function') window.tsCopy = tsCopy;
if (typeof tsExport === 'function') window.tsExport = tsExport;
if (typeof tsFillPrompt === 'function') window.tsFillPrompt = tsFillPrompt;
if (typeof tsGenerateCopy === 'function') window.tsGenerateCopy = tsGenerateCopy;
if (typeof tsOptimizePrompt === 'function') window.tsOptimizePrompt = tsOptimizePrompt;
if (typeof ucChangePassword === 'function') window.ucChangePassword = ucChangePassword;
if (typeof unbindAccount === 'function') window.unbindAccount = unbindAccount;
if (typeof updateCommentCharCount === 'function') window.updateCommentCharCount = updateCommentCharCount;
if (typeof updateDeriveNum === 'function') window.updateDeriveNum = updateDeriveNum;
if (typeof updateReplyCount === 'function') window.updateReplyCount = updateReplyCount;
if (typeof updateSmartReplyCharCount === 'function') window.updateSmartReplyCharCount = updateSmartReplyCharCount;
if (typeof useHotspotKeyword === 'function') window.useHotspotKeyword = useHotspotKeyword;
if (typeof useProductSample === 'function') window.useProductSample = useProductSample;
if (typeof useSourcingKeyword === 'function') window.useSourcingKeyword = useSourcingKeyword;
if (typeof validateDuration === 'function') window.validateDuration = validateDuration;
if (typeof vcCancelStoryboardEdit === 'function') window.vcCancelStoryboardEdit = vcCancelStoryboardEdit;
if (typeof vcEditStoryboard === 'function') window.vcEditStoryboard = vcEditStoryboard;
if (typeof vcFillPromptByIndex === 'function') window.vcFillPromptByIndex = vcFillPromptByIndex;
if (typeof vcGenerateSegments === 'function') window.vcGenerateSegments = vcGenerateSegments;
if (typeof vcGenerateStoryboard === 'function') window.vcGenerateStoryboard = vcGenerateStoryboard;
if (typeof vcGenerateStoryboardScript === 'function') window.vcGenerateStoryboardScript = vcGenerateStoryboardScript;
if (typeof vcGenerateVideo === 'function') window.vcGenerateVideo = vcGenerateVideo;
if (typeof vcHandleRefUpload === 'function') window.vcHandleRefUpload = vcHandleRefUpload;
if (typeof vcSaveStoryboard === 'function') window.vcSaveStoryboard = vcSaveStoryboard;
if (typeof viewFullImage === 'function') window.viewFullImage = viewFullImage;


if (typeof openImportModelsModal === 'function') window.openImportModelsModal = openImportModelsModal;
if (typeof closeImportModelsModal === 'function') window.closeImportModelsModal = closeImportModelsModal;
if (typeof applyImportPreset === 'function') window.applyImportPreset = applyImportPreset;
if (typeof toggleImportApiKeyVisibility === 'function') window.toggleImportApiKeyVisibility = toggleImportApiKeyVisibility;
if (typeof fetchRemoteModels === 'function') window.fetchRemoteModels = fetchRemoteModels;
if (typeof renderImportModelsList === 'function') window.renderImportModelsList = renderImportModelsList;
if (typeof onToggleImportModelItem === 'function') window.onToggleImportModelItem = onToggleImportModelItem;
if (typeof onChangeImportModelType === 'function') window.onChangeImportModelType = onChangeImportModelType;
if (typeof filterImportModels === 'function') window.filterImportModels = filterImportModels;
if (typeof toggleSelectAllImportModels === 'function') window.toggleSelectAllImportModels = toggleSelectAllImportModels;
if (typeof updateImportSelectionSummary === 'function') window.updateImportSelectionSummary = updateImportSelectionSummary;
if (typeof confirmImportSelectedModels === 'function') window.confirmImportSelectedModels = confirmImportSelectedModels;
if (typeof fetchModelsForEditModal === 'function') window.fetchModelsForEditModal = fetchModelsForEditModal;
