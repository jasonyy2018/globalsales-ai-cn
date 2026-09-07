"use client";

import React from "react";
import { Store, Globe2, CalendarDays, BarChart3 } from "lucide-react";

export function CommercePlatformsModule() {
  const platforms = [
    {
      name: "抖音电商",
      type: "兴趣电商 / 内容货架双轮驱动",
      traffic: "公域推荐流、商城搜索、店铺主页、直播推荐",
      rules: "GPM（千次曝光成交额）核心考核，前3秒完播与互动率直接决定流量池阶梯。",
      tips: "适合视觉冲击力强、有强展示或演示场景的冲动型消费品。",
    },
    {
      name: "快手电商",
      type: "信任电商 / 强老铁私域黏性",
      traffic: "关注页私域流、发现页公域、快手商城",
      rules: "强调主播人设和真实人际信任感，复购率高，售后与体验分门槛严格。",
      tips: "适合性价比高、实用刚需、强人设带货品类（农特、日用、亲民服饰）。",
    },
    {
      name: "淘宝 / 天猫",
      type: "综合搜索货架电商",
      traffic: "关键词搜索、猜你喜欢推荐、逛逛内容流、直播间",
      rules: "坑产、转化率、点击率与DSR动态评分构成搜索排名的权重基石。",
      tips: "详情页需具备高信息密度与答疑完整度，兼顾付费推广与自然流配合。",
    },
    {
      name: "拼多多",
      type: "社交裂变与全网极致性价比",
      traffic: "活动会场、拼单推荐、万人团、百亿补贴",
      rules: "价格力与发货考核极高，强调单品极致规模效应与秒杀拼团机制。",
      tips: "白牌走量、供应链成本优势明显的快消标品优势巨大。",
    },
    {
      name: "京东商城",
      type: "自营品质与高客单消费",
      traffic: "精准品类搜索、排行榜、秒杀特惠、京准通",
      rules: "重物流体验（京东物流占比高）与正品心智，数码家电及高品质日用占优。",
      tips: "高客单、重售后保障、追求省心时效的高净值家庭消费品首选。",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
        <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <Store className="w-5 h-5 text-lime-400" />
          <span>国内主流电商平台运营图鉴</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          深入解析国内核心电商渠道的核心定位、流量分发机制与选品带货建议。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map((p, i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold text-slate-100">{p.name}</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-lime-500/20 text-lime-300 font-medium">
                {p.type}
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-300">
              <div><span className="text-slate-500">流量阵地：</span>{p.traffic}</div>
              <div><span className="text-slate-500">分发核心：</span>{p.rules}</div>
              <div><span className="text-slate-500">带货策略：</span>{p.tips}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SocialPlatformsModule() {
  const platforms = [
    {
      name: "小红书",
      audience: "年轻高线城市女性与精致新中产",
      traits: "强种草心智、去中心化双列信息流、搜索即决策",
      strategy: "首图吸睛、标题抓痛点、正文真实分享感、评论区沉淀真实反馈。",
    },
    {
      name: "微信视频号",
      audience: "全年龄段国民级社交圈，熟人裂变强",
      traits: "社交点赞推荐流占比高、私域公域打通最顺畅",
      strategy: "正能量金句、生活智慧、文化情感共鸣、强社交转发驱动。",
    },
    {
      name: "微信公众号",
      audience: "深度阅读偏好者、职场白领、高净值人群",
      traits: "私域订阅沉淀、品牌信任度最高、深度行文阵地",
      strategy: "深度观点输出、知识图谱沉淀、多平台图文二次深度承接。",
    },
    {
      name: "知乎",
      audience: "追求理性与逻辑分析的青年群体、学生与专业人士",
      traits: "问答形态、长尾搜索权重极高、强调干货与亲历背书",
      strategy: "多角度拆解原理、实验评测对比、逻辑严谨的图文软文导流。",
    },
    {
      name: "Bilibili (B站)",
      audience: "Z世代青年群体、硬核二次元与数码爱好者",
      traits: "中长视频为主、弹幕互动文化、对内容诚意与质量容忍度高",
      strategy: "用梗自然、拒绝硬广、强调深度硬核评测与剧情叙事趣味。",
    },
    {
      name: "新浪微博",
      audience: "全网热点吃瓜、泛娱乐与大众话题讨论场",
      traits: "实时热搜榜、强时效性传播、短平快与裂变转发",
      strategy: "紧跟突发热搜借势发声，双#话题标签#，注重互动抽奖与转评引流。",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
        <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <Globe2 className="w-5 h-5 text-fuchsia-400" />
          <span>主流社媒平台创作指南</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          梳理主流自媒体生态的受众画像、平台偏好与爆款内容创作建议。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map((p, i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold text-slate-100">{p.name}</span>
              <span className="text-[11px] text-fuchsia-400 font-semibold">{p.audience}</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-300">
              <div><span className="text-slate-500">平台调性：</span>{p.traits}</div>
              <div><span className="text-slate-500">创作秘诀：</span>{p.strategy}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HolidaysModule() {
  const holidays = [
    { month: "1月-2月", name: "元旦 · 春节 · 元宵节", focus: "年货节、送礼心智、团聚返乡、开工大吉", prep: "提前30天启动年货节选品与送礼图文储备" },
    { month: "3月", name: "三八妇女节 · 女神节", focus: "悦己消费、美妆个护、女性力量、首饰轻奢", prep: "提前15天主打女性礼赠与自用高颜值开箱" },
    { month: "5月", name: "五一劳动节 · 母亲节 · 520", focus: "户外出行、亲情送礼、情侣表白、旅游轻便好物", prep: "4月中旬启动露营出行装备与浪漫礼物榜单" },
    { month: "6月", name: "618年中大促 · 父亲节 · 端午", focus: "上半年最强价格力囤货、数码3C换新、父亲礼物", prep: "5月下旬启动全平台比价种草与凑单攻略" },
    { month: "9月-10月", name: "中秋节 · 国庆黄金周", focus: "月饼送礼、秋季养生、出游自驾、换季服饰", prep: "8月中旬启动礼盒预定与国庆出行好物种草" },
    { month: "11月", name: "双11全网大促", focus: "全年规模最大消费心智、降价爆品、大额券返利", prep: "10月中旬抢占搜索SEO与大促预热清单" },
    { month: "12月", name: "双12 · 年终盘点 · 圣诞跨年", focus: "年末冲量、暖冬家居、新年日历、仪式感跨年", prep: "11月下旬开启冬季御寒与年终好物盘点" },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
        <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <CalendarDays className="w-5 h-5 text-emerald-400" />
          <span>国内营销节日节点与备战日历</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          把握全年消费波峰，前置规划自媒体种草宣发节奏。
        </p>
      </div>

      <div className="space-y-3">
        {holidays.map((h, i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                  {h.month}
                </span>
                <span className="text-sm font-bold text-slate-100">{h.name}</span>
              </div>
              <p className="text-xs text-slate-300">主题核心：{h.focus}</p>
            </div>
            <div className="text-xs text-slate-400 bg-slate-950 p-2 rounded-xl border border-slate-800/80 shrink-0 md:max-w-xs">
              <span className="text-emerald-400 font-semibold">排期建议：</span>{h.prep}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricsModule() {
  const metrics = [
    { name: "ROI (投资回报率)", formula: "总GMV / 总投入花费", desc: "带货与投放效果的核心生死线。ROI>1为盈亏平衡，达人合作通常追求2以上。" },
    { name: "GPM (千次曝光成交额)", formula: "(GMV / 曝光次数) × 1000", desc: "衡量直播间或短视频内容带货效率最核心的指标，直接决定平台是否推流。" },
    { name: "完播率 (Completion Rate)", formula: "播放完人数 / 总播放人数", desc: "短视频内容质量的第一道门槛。前3秒留存率与5秒完播是算法池放量的关键。" },
    { name: "CTR (点击率)", formula: "点击人数 / 曝光人数", desc: "封面图与标题的抓人程度。图文带货通常要求点击率在 8%~15% 以上。" },
    { name: "互动率 (Engagement)", formula: "(点赞+评论+收藏+转发) / 播放量", desc: "内容共鸣度与社交传播力的指标，小红书尤其看重收藏与赞藏比。" },
    { name: "UV价值 (客单贡献)", formula: "成交金额 / 进店独立访客数", desc: "衡量商品承接力与连带购买强度的综合转化效率。" },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl">
        <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-sky-400" />
          <span>电商与自媒体关键运营指标字典</span>
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          搞懂算法分发背后的数据逻辑，针对性优化内容生产与投放参数。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold text-slate-100">{m.name}</span>
              <span className="text-[11px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">
                {m.formula}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed pt-1">{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
