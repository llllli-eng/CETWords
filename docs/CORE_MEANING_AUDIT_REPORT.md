# Phase 16.2 CET 核心词义质量审计报告

> 本报告由 `scripts/audit-core-meanings.py` 基于重建后的 CET4/CET6 词库、词频层级、neutral 保护清单和构建审计记录自动生成。候选识别是风险筛查，不等同于词典学结论；未自动修复项继续保留在人工确认清单。

## 审计范围与方法

- 审计词条：12241（按 CET4/CET6 书内记录计数）
- 优先范围：9359（核心词、S/A/B、neutral 的并集）
- 质量告警记录：7511
- 固定上游源提交：`8814e02b40f69a2a6e016dbde087010304fcedfc`
- 自动候选信号：缺失/结构不一致、核心义不在详细义项、人名/地名、乱码或标记、超长/异常标点、专业标签。
- 修复方式：由构建器在合并原始释义后应用审计覆盖清单，并系统清除核心展示中的专名/来源标签；不直接手改生成结果。

## 汇总

| 词库 | 审计 | 核心 | 补充 | 优先范围 | 质量告警 | 已修复 | 待人工确认 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| CET4 | 5579 | 4544 | 1035 | 4731 | 3384 | 280 | 0 |
| CET6 | 6662 | 3991 | 2671 | 4628 | 4127 | 215 | 0 |

候选（按书内记录）：修复前 495，已修复 495，仍待人工确认 0。

### 修复分布

| 维度 | 数量 |
| --- | ---: |
| CET4 | 280 |
| CET6 | 215 |
| neutral | 52 |
| raw tier S | 120 |
| raw tier A | 43 |
| raw tier B | 36 |
| raw tier C | 84 |
| raw tier D | 107 |
| raw tier E | 105 |
| raw tier unmatched | 0 |
| 风险 P0 | 0 |
| 风险 P1 | 175 |
| 风险 P2 | 127 |
| 风险 P3 | 51 |
| 风险 P4 | 142 |

## 强制验收样例

- `down`：核心义为“向下；往下；在下面；下降”；“软毛/绒毛/高地”只在详细义项。
- `ensure`：核心义为“确保；保证”，已移除误导性的“保护”。
- `paper`：继续保持“纸；论文；试卷”，未被本阶段覆盖。

## 人工抽查清单

| 单词 | 状态 | CET4 核心义 | CET6 核心义 | 结论 |
| --- | --- | --- | --- | --- |
| down | repaired | 向下；往下；在下面；下降 | 向下；往下；在下面；下降 | pass |
| ensure | repaired | 确保；保证 | 确保；保证 | pass |
| paper | confirmed_unchanged | 纸；论文；试卷 | 纸；论文；试卷 | pass |
| issue | confirmed_unchanged | 问题；发行；发布 | 问题；发行；发布 | pass |
| figure | confirmed_unchanged | 数字；人物；图形 | 数字；人物；图形 | pass |
| address | confirmed_unchanged | 地址；处理；向……讲话 | 地址；处理；向……讲话 | pass |
| subject | confirmed_unchanged | 主题；学科；主语 | 主题；学科；主语 | pass |
| present | confirmed_unchanged | 现在的；礼物；呈现 | 现在的；礼物；呈现 | pass |
| matter | confirmed_unchanged | 事情；物质；重要 | 事情；物质；重要 | pass |
| case | confirmed_unchanged | 情况；案例；案件 | 情况；案例；案件 | pass |
| up | repaired | 向上；在上面；上升 | — | pass |
| out | repaired | 向外；在外；出去；不在 | 向外；在外；出去；不在 | pass |
| off | repaired | 离开；关掉；停止；休息的 | 离开；关掉；停止；休息的 | pass |
| over | repaired | 在……上方；越过；超过；结束 | 在……上方；越过；超过；结束 | pass |
| under | repaired | 在……下面；低于；在……控制下 | — | pass |
| set | repaired | 放置；设置；一套；集合 | 放置；设置；一套；集合 | pass |
| point | confirmed_unchanged | 点；观点；要点；分数 | 点；观点；要点；分数 | pass |
| right | repaired | 正确的；右边；权利；恰好 | — | pass |
| left | repaired | 左边的；左边；剩下的 | 左边的；左边；剩下的 | pass |
| mean | repaired | 意思是；意味着；平均的；吝啬的 | 意思是；意味着；平均的；吝啬的 | pass |
| hold | repaired | 拿着；保持；举行；容纳 | 拿着；保持；举行；容纳 | pass |
| run | repaired | 跑；运行；经营；持续 | — | pass |
| turn | repaired | 转动；转弯；变成；轮次 | — | pass |
| take | repaired | 拿；带走；花费；采取 | — | pass |
| make | repaired | 制造；使得；成为；赚得 | 制造；使得；成为；赚得 | pass |
| get | repaired | 得到；到达；变得；理解 | 得到；到达；变得；理解 | pass |
| work | repaired | 工作；起作用；作品；运转 | — | pass |

## 完整修复记录

| 词库 | ID | 单词 | raw tier | effective | 风险 | 原核心义 | 新核心义 | 原因 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CET4 | cet4-afford | afford | B | B | P2 | 提供；担负得起……………………；(Afford)人名 | 买得起；承担得起；提供 | proper_name_promoted | 核心义混入专名；恢复经济承受和提供义。 |
| CET4 | cet4-demand | demand | B | B | P2 | 要求；需要；[经] 需求 | 要求；需要；需求 | specialized_sense_promoted | 核心义偏向专门术语；恢复一般要求和需求义。 |
| CET4 | cet4-ensure | ensure | S | S | P2 | 保证；保护 | 确保；保证 | misleading_core_sense | 删除会误导作答的“保护”，只保留 ensure 的核心保证义。 |
| CET4 | cet4-legal | legal | C | C | P2 | 法律的；合法的；(Legal)人名 | 法律的；合法的 | specialized_sense_promoted | 避免专门法律术语占据核心，突出一般法律属性和合法性。 |
| CET4 | cet4-suffer | suffer | A | A | P2 | (Suffer)人名；(意)苏费尔；遭受 | 遭受；忍受；受苦 | proper_name_promoted | 核心义混入专名；恢复遭受和受苦义。 |
| CET4 | cet4-vital | vital | B | B | P2 | 重要的；生命的, 有生命力的；(Vital)人名 | 至关重要的；有生命的 | proper_name_promoted | 核心义混入专名；恢复重要性和生命属性义。 |
| CET4 | cet4-a | a | S | neutral | P2 | 字母A；第一流的 | 一个；一（用于单数可数名词前） | function_word_core_anomaly | 最高频冠词的核心义被字母名称和等级义占据；恢复基础冠词义。 |
| CET4 | cet4-able | able | S | S | P2 | 有能力的；(Able)人名；(伊朗)阿布勒 | 有能力的；能干的 | proper_name_promoted | 核心义混入专名；恢复能力形容词义。 |
| CET4 | cet4-ago | ago | S | S | P2 | (Ago)人名；(英、西、意、塞、瑞典)阿戈 | 以前 | proper_name_promoted | 核心义混入专名；恢复时间副词义。 |
| CET4 | cet4-also | also | S | S | P2 | 也；(Also)人名；(罗)阿尔索 | 也；而且 | proper_name_promoted | 核心义混入专名；恢复补充和递进副词义。 |
| CET4 | cet4-and | and | S | neutral | P2 | (And)人名；(土、瑞典)安德 | 和；与；而且 | proper_name_promoted | 核心义混入人名；恢复并列和递进连接义。 |
| CET4 | cet4-any | any | S | S | P2 | 任何的；任何一个；(Any)人名 | 任何的；任一；一些 | proper_name_promoted | 核心义混入专名；恢复限定词和代词用法。 |
| CET4 | cet4-argue | argue | B | B | P2 | 说服；争论,争辩,辩论；(Argue)人名 | 争论；论证；主张 | proper_name_promoted | 核心义混入专名；恢复争论和论证义。 |
| CET4 | cet4-as | as | S | neutral | P3 | 因为；当……………………时；同样地 | 作为；像；当……时；因为 | function_word_core_anomaly | 补足角色、比较、时间和原因等高频连接义。 |
| CET4 | cet4-ask | ask | S | S | P2 | 要求；邀请；(Ask)人名 | 询问；请求；要求；邀请 | proper_name_promoted | 核心义混入专名；恢复询问和请求等高频义。 |
| CET4 | cet4-at | at | S | neutral | P3 | 阿特(老挝货币基本单位att)；砹(极不稳定放射性元素)；在(表示存在或出现的地点、场所、位置、空间) | 在；向；以（价格、速度等） | function_word_core_anomaly | 补足地点、方向和比率等常用介词义。 |
| CET4 | cet4-aware | aware | A | A | P2 | 知道的, 意识到的；(Aware)人名；(阿拉伯、索)阿瓦雷 | 知道的；意识到的 | proper_name_promoted | 核心义混入专名；恢复认知状态义。 |
| CET4 | cet4-be | be | S | neutral | P2 | (Be)人名；(缅)拜 | 是；存在；成为 | proper_name_promoted | 核心义混入专名；恢复系动词和存在义。 |
| CET4 | cet4-begin | begin | A | A | P2 | 开始；(Begin)人名；(以、德)贝京 | 开始 | proper_name_promoted | 核心义混入专名；恢复开始义。 |
| CET4 | cet4-big | big | A | A | P2 | (Big)人名；(土)比格 | 大的；重要的；重大的 | proper_name_promoted | 核心义混入专名；恢复尺寸和重要性义。 |
| CET4 | cet4-born | born | B | B | P2 | 天生的；出生的；(Born)人名 | 出生的；天生的 | proper_name_promoted | 核心义混入专名；恢复出生和先天属性义。 |
| CET4 | cet4-both | both | S | S | P2 | 两者都；双方都；(Both)人名 | 两者都；双方 | proper_name_promoted | 核心义混入专名；恢复两者共同指代义。 |
| CET4 | cet4-bring | bring | A | A | P2 | 带来；促使；(Bring)人名 | 带来；拿来；引起 | proper_name_promoted | 核心义混入专名；恢复移动和导致义。 |
| CET4 | cet4-busy | busy | B | B | P2 | 忙碌的；(Busy)人名；(匈)布希 | 忙碌的；繁忙的；占线的 | proper_name_promoted | 核心义混入专名；恢复人员、地点和线路状态义。 |
| CET4 | cet4-but | but | S | neutral | P3 | 但是,可是；(But)人名；(俄、罗)布特 | 但是；除……之外 | function_word_core_anomaly | 补足转折和排除两类常见用法。 |
| CET4 | cet4-by | by | S | neutral | P3 | 被；通过；经过 | 由；被；通过；在……旁边 | function_word_core_anomaly | 补足施事、方式和位置等基础介词义。 |
| CET4 | cet4-certain | certain | B | B | P2 | (Certain)人名；(葡)塞尔塔因；某一 | 确定的；某一；某些 | proper_name_promoted | 核心义混入专名；恢复确定性和非特指限定义。 |
| CET4 | cet4-collect | collect | A | A | P2 | 收集；(Collect)人名；(英)科莱克特 | 收集；领取；募捐 | proper_name_promoted | 核心义混入专名；恢复收集、领取和筹集义。 |
| CET4 | cet4-come | come | S | S | P2 | 出现；变成；(Come)人名 | 来；到达；出现；变成 | proper_name_promoted | 核心义混入专名；恢复移动、出现和变化义。 |
| CET4 | cet4-culture | culture | A | A | P2 | 文化,文明；教养；[细胞][微] 培养(等于cultivate) | 文化；文明；培养 | specialized_sense_promoted | 核心义偏向专业培养义；突出社会文化义并保留培养义。 |
| CET4 | cet4-differ | differ | B | B | P2 | 不同,相异；(Differ)人名；(法)迪费 | 不同；有区别 | proper_name_promoted | 核心义混入专名；恢复差异义。 |
| CET4 | cet4-do | do | S | neutral | P3 | 用以构成疑问句及否定句；做,干 | 做；干；助动词 | function_word_core_anomaly | 补足实义动词和助动词两种最高频用法。 |
| CET4 | cet4-down | down | S | S | P1 | 软毛,绒毛；[地质] 开阔的高地 | 向下；往下；在下面；下降 | rare_sense_promoted | 原核心义只显示“软毛/高地”等罕见名词义；恢复方向和下降义，同时将罕见义保留在详细义项。 |
| CET4 | cet4-during | during | A | A | P2 | (During)人名；(法)迪兰；在……………………的时候,在……………………的期间 | 在……期间 | proper_name_promoted | 核心义混入专名；恢复时间介词义。 |
| CET4 | cet4-early | early | A | A | P2 | 早的,早期的；(Early)人名；(英)厄尔利 | 早的；早期的；提前 | proper_name_promoted | 核心义混入专名；恢复时间形容词和副词义。 |
| CET4 | cet4-else | else | A | A | P2 | 别的；(Else)人名；(英)埃尔斯 | 其他的；另外 | proper_name_promoted | 核心义混入专名；恢复补充和替代义。 |
| CET4 | cet4-even | even | S | S | P2 | 平坦的；甚至；(Even)人名 | 甚至；平坦的；偶数的 | proper_name_promoted | 核心义混入专名；保留强调、平坦和偶数等常用义。 |
| CET4 | cet4-ever | ever | A | A | P2 | 曾经；(Ever)人名；(英)埃弗 | 曾经；始终；究竟 | proper_name_promoted | 核心义混入专名；恢复时间和强调副词义。 |
| CET4 | cet4-every | every | S | S | P2 | 每隔……………………的；(Every)人名；(英)埃夫里 | 每个；每一 | proper_name_promoted | 核心义混入专名；恢复全称限定义。 |
| CET4 | cet4-for | for | S | neutral | P3 | 因为；给 | 为了；给；对于；因为 | function_word_core_anomaly | 补足目的、对象和原因等考试高频用法。 |
| CET4 | cet4-four | four | S | S | P2 | (Four)人名；(西)福尔 | 四；四个 | proper_name_promoted | 核心义混入专名；恢复基础数词义。 |
| CET4 | cet4-free | free | A | A | P2 | 免费的；(Free)人名；(英)弗里 | 免费的；自由的；空闲的 | proper_name_promoted | 核心义混入专名；恢复价格、自由和时间状态义。 |
| CET4 | cet4-friendly | friendly | B | B | P2 | 友好的；(Friendly)人名；(英)弗兰德利 | 友好的；友善的 | proper_name_promoted | 核心义混入专名；恢复态度和关系义。 |
| CET4 | cet4-get | get | S | S | P1 | 到达；生殖；幼兽 | 得到；到达；变得；理解 | rare_sense_promoted | 原核心义被“生殖/幼兽”等罕见名词义污染；恢复高频动词义。 |
| CET4 | cet4-golden | golden | D | D | P1 | (Golden)人名；(英、法、罗、德、瑞典)戈尔登 | 金色的；黄金般的；极好的 | proper_name_only_source | 源记录只给出人名；补入四六级常用形容词义并把人名留在详细义项。 |
| CET4 | cet4-grow | grow | S | S | P2 | 生长；(Grow)人名；(英)格罗 | 生长；增长；种植；逐渐变得 | proper_name_promoted | 核心义混入专名；恢复生长、增加、种植和变化义。 |
| CET4 | cet4-hard | hard | A | A | P2 | 硬的；困难的；(Hard)人名 | 困难的；坚硬的；努力地 | proper_name_promoted | 核心义混入专名；恢复难度、物理性质和努力程度义。 |
| CET4 | cet4-have | have | S | neutral | P3 | 有；(Have)人名；(芬)哈韦 | 有；拥有；已经（助动词） | function_word_core_anomaly | 补足拥有义和完成时助动词用法。 |
| CET4 | cet4-he | he | S | neutral | P3 | 男孩,男人；它(雄性动物) | 他 | function_word_core_anomaly | 明确基础人称代词义。 |
| CET4 | cet4-her | her | S | neutral | P3 | (法)埃尔(人名)；她(she的宾格) | 她；她的 | function_word_core_anomaly | 补足宾格和所有格限定词两种基础用法。 |
| CET4 | cet4-hers | hers | E | E | P1 | (Hers)人名；(法)埃尔 | 她的（所有格代词） | proper_name_only_source | 源记录只给出人名；补入第三人称女性所有格代词义。 |
| CET4 | cet4-hi | hi | E | E | P1 | (Hi)人名；(柬)希 | 嗨；你好 | proper_name_only_source | 源记录只给出人名；补入常用问候语义。 |
| CET4 | cet4-him | him | A | A | P2 | (Him)人名；(东南亚国家华语)欣 | 他（宾格） | proper_name_promoted | 核心义混入专名；恢复第三人称男性宾格义。 |
| CET4 | cet4-his | his | S | neutral | P2 | (His)人名；(法)伊斯 | 他的 | proper_name_promoted | 核心义混入专名；恢复第三人称男性所有格义。 |
| CET4 | cet4-hold | hold | B | B | P3 | 拥有；控制；保留 | 拿着；保持；举行；容纳 | common_sense_missing | 补足拿持、保持、举办和容纳等高频动词义。 |
| CET4 | cet4-huge | huge | A | A | P2 | (Huge)人名；(英)休奇 | 巨大的 | proper_name_promoted | 核心义混入专名；恢复尺寸和程度义。 |
| CET4 | cet4-if | if | S | neutral | P3 | 条件；设想 | 如果；是否 | function_word_core_anomaly | 补足条件从句和间接疑问的基础义。 |
| CET4 | cet4-in | in | S | neutral | P2 | 执政者；门路 | 在……里面；进入；处于 | function_word_core_anomaly | 核心义被“执政者/门路”等低频名词义占据；恢复基础介词义。 |
| CET4 | cet4-into | into | S | S | P2 | (Into)人名；(芬、英)因托 | 进入；到……里面；变成 | proper_name_promoted | 核心义混入专名；恢复方向和状态变化义。 |
| CET4 | cet4-it | it | S | neutral | P2 | [指无生命的东西、动物、植物]它；这 | 它；这；那 | proper_name_promoted | 核心义混入专名；恢复第三人称和形式主语常用指代义。 |
| CET4 | cet4-its | its | S | S | P2 | 它的；(Its)人名 | 它的 | proper_name_promoted | 核心义混入专名；恢复第三人称中性所有格义。 |
| CET4 | cet4-just | just | S | S | P2 | (Just)人名；(英)贾斯特；公正的,合理的 | 正好；刚才；公正的；仅仅 | proper_name_promoted | 核心义混入专名；恢复时间、程度和公正义。 |
| CET4 | cet4-later | later | B | B | P2 | 后来；(Later)人名 | 后来；较晚的 | proper_name_promoted | 核心义混入专名；恢复时间先后义。 |
| CET4 | cet4-lazy | lazy | D | D | P1 | (Lazy)人名；(德)拉齐 | 懒惰的；懒散的 | proper_name_only_source | 源记录只给出人名；补入常用形容词义。 |
| CET4 | cet4-learned | learned | B | B | P2 | 有学问的；学术上的；(Learned)人名 | 有学问的；博学的 | proper_name_promoted | 核心义混入专名；恢复知识丰富的形容词义。 |
| CET4 | cet4-left | left | A | A | P3 | 左边的；左边；左派 | 左边的；左边；剩下的 | common_sense_missing | 补足方向义和 leave 的过去分词状态义。 |
| CET4 | cet4-lend | lend | D | D | P1 | (Lend)人名；(德)伦德 | 借给；贷款给 | proper_name_only_source | 源记录只给出人名；补入借出和提供贷款义。 |
| CET4 | cet4-live | live | S | S | P2 | 活的；(Live)人名；(法)利夫 | 生活；居住；活的；现场直播的 | proper_name_promoted | 核心义混入专名；恢复生活、居住、存活和直播义。 |
| CET4 | cet4-lose | lose | A | A | P2 | (Lose)人名；(英)洛斯；浪费 | 失去；输掉；迷失；浪费 | proper_name_promoted | 核心义混入专名；恢复失去、失败和迷失等高频义。 |
| CET4 | cet4-loud | loud | D | D | P1 | (Loud)人名；(英)劳德 | 大声的；响亮的 | proper_name_only_source | 源记录只给出人名；补入声音强度义。 |
| CET4 | cet4-make | make | S | S | P3 | 制造；构造；使得 | 制造；使得；成为；赚得 | common_sense_missing | 补足制造、使役、变化和收入等常用动词义。 |
| CET4 | cet4-mean | mean | B | B | P1 | 平均值；平均的；卑鄙的 | 意思是；意味着；平均的；吝啬的 | rare_sense_promoted | 原核心义遗漏最常用动词义并突出“平均值/卑鄙”；恢复“意思是/意味着”。 |
| CET4 | cet4-my | my | S | neutral | P2 | 我的；(My)人名 | 我的 | proper_name_promoted | 核心义混入专名；恢复第一人称所有格限定义。 |
| CET4 | cet4-new | new | S | S | P2 | (New)人名；(英)纽 | 新的；新出现的；新鲜的 | proper_name_promoted | 核心义混入专名；恢复常用形容词义。 |
| CET4 | cet4-of | of | S | neutral | P3 | ……………………的；关于 | ……的；关于；属于 | function_word_core_anomaly | 补足所属和相关关系的高频介词义。 |
| CET4 | cet4-off | off | S | S | P3 | 远离的；空闲的；切断 | 离开；关掉；停止；休息的 | common_sense_missing | 补足离开、关闭、停止和休息状态等常用义。 |
| CET4 | cet4-on | on | S | neutral | P2 | 关于；在…………………………………………时候；(On)人名 | 在……上；关于；继续 | function_word_core_anomaly | 清除核心位置中的专名干扰，突出位置、主题和持续义。 |
| CET4 | cet4-or | or | S | neutral | P3 | 或,或者；(Or)人名；(中)柯(广东话·威妥玛) | 或者；否则 | function_word_core_anomaly | 补足选择和条件后果的常用连接义。 |
| CET4 | cet4-out | out | S | S | P2 | 出局；外面的 | 向外；在外；出去；不在 | exam_priority_mismatch | 原核心义偏向“出局/外面的”；恢复阅读中更常用的方向和状态义。 |
| CET4 | cet4-over | over | S | S | P2 | 越过；在……………………之上；超过 | 在……上方；越过；超过；结束 | exam_priority_mismatch | 原核心义碎片化且排序失真；恢复位置、跨越、数量和结束义。 |
| CET4 | cet4-owner | owner | B | B | P2 | 物主,所有人；[经] 所有者 | 所有者；物主 | proper_name_promoted | 核心义混入专名；恢复所有权主体义。 |
| CET4 | cet4-per | per | A | A | P2 | 每；(Per)人名；(德、挪、丹、瑞典)佩尔 | 每；每一 | proper_name_promoted | 核心义混入专名；恢复比率介词义。 |
| CET4 | cet4-poor | poor | A | A | P2 | 贫穷的；贫乏的；(Poor)人名 | 贫穷的；差的；不足的 | proper_name_promoted | 核心义混入专名；恢复经济、质量和数量不足义。 |
| CET4 | cet4-rainy | rainy | E | E | P1 | (Rainy)人名；(英)雷尼 | 多雨的；下雨的 | proper_name_only_source | 源记录只给出人名；补入天气形容词义。 |
| CET4 | cet4-rather | rather | S | S | P2 | 宁可,宁愿；相当；(Rather)人名 | 相当；宁愿；而不是 | proper_name_promoted | 核心义混入专名；恢复程度和偏好等常用结构义。 |
| CET4 | cet4-say | say | S | S | P2 | (Say)人名；(土)萨伊；讲 | 说；讲；表示 | proper_name_promoted | 核心义混入专名；恢复表达和陈述义。 |
| CET4 | cet4-urban | urban | D | D | P2 | 住在都市的；都市的,住在都市的；(Urban)人名 | 城市的；都市的 | specialized_sense_promoted | 避免专名或狭窄义占据核心，突出城市属性。 |
| CET4 | cet4-video | video | B | B | P2 | 录像的；电视的；[电子] 视频 | 视频；录像 | proper_name_promoted | 核心义混入专名；恢复音像内容义。 |
| CET4 | cet4-truly | truly | B | B | P2 | (Truly)人名；(英)特鲁利 | 真正地；确实 | proper_name_promoted | 核心义混入专名；恢复真实性和强调义。 |
| CET4 | cet4-am | am | C | C | P1 | (柬)安(人名) | 是（be 的第一人称单数现在式） | proper_name_only_source | 源记录只给出人名；补入 be 的第一人称单数现在式。 |
| CET4 | cet4-flaming | flaming | E | E | P1 | (Flaming)人名 | 燃烧的；火红的；强烈的 | proper_name_only_source | 源记录只给出人名；补入燃烧、颜色和程度义。 |
| CET4 | cet4-ha | ha | E | E | P1 | (Ha)人名 | 哈；啊（表示惊讶或得意） | proper_name_only_source | 源记录只给出人名；补入常用感叹词义。 |
| CET4 | cet4-hilly | hilly | E | E | P1 | (Hilly)人名 | 多小山的；丘陵起伏的 | proper_name_only_source | 源记录只给出人名；补入地形形容词义。 |
| CET4 | cet4-rich | rich | B | B | P1 | (Rich)人名 | 富有的；丰富的；肥沃的 | proper_name_only_source | 源记录只给出人名；补入财富、含量和土壤性质义。 |
| CET4 | cet4-right | right | S | S | P3 | 正确 | 正确的；右边；权利；恰好 | common_sense_missing | 补足正确、方向、权利和强调副词等常用义。 |
| CET4 | cet4-run | run | A | A | P3 | 奔跑；赛跑 | 跑；运行；经营；持续 | common_sense_missing | 覆盖人体运动、系统运行、经营和持续等常见义。 |
| CET4 | cet4-same | same | S | S | P1 | (Same)人名；(意)萨梅 | 相同的；同一的 | proper_name_only_source | 源记录只给出人名；补入相同和同一指代义。 |
| CET4 | cet4-seem | seem | S | S | P1 | (Seem)人名；(英)西姆 | 似乎；好像 | proper_name_only_source | 源记录只给出人名；补入判断和表象系动词义。 |
| CET4 | cet4-set | set | A | A | P3 | 集合；一套；树立 | 放置；设置；一套；集合 | common_sense_missing | 覆盖动词和名词的考试常见义，避免只保留单一义项。 |
| CET4 | cet4-she | she | A | neutral | P3 | 女人 | 她 | function_word_core_anomaly | 明确基础人称代词义。 |
| CET4 | cet4-slow | slow | C | C | P1 | (Slow)人名；(英)斯洛 | 慢的；缓慢地；减速 | proper_name_only_source | 源记录只给出人名；补入速度形容词、副词和动词义。 |
| CET4 | cet4-so | so | S | S | P1 | (So)人名；(柬)索 | 如此；这么；所以 | proper_name_only_source | 源记录只给出人名；补入程度和结果连接义。 |
| CET4 | cet4-strong | strong | A | A | P1 | (Strong)人名 | 强壮的；强烈的；牢固的 | proper_name_only_source | 源记录只给出人名；补入体力、程度和牢固性义。 |
| CET4 | cet4-such | such | S | S | P1 | (Such)人名；(英)萨奇 | 这样的；如此的 | proper_name_only_source | 源记录只给出人名；补入指示类别和程度义。 |
| CET4 | cet4-sure | sure | B | B | P1 | (Sure)人名；(英)休尔 | 确信的；一定的；当然 | proper_name_only_source | 源记录只给出人名；补入确信、必然和应答义。 |
| CET4 | cet4-take | take | S | S | P1 | 捕获量；看法 | 拿；带走；花费；采取 | rare_sense_promoted | 原核心义被“捕获量/看法”等名词义占据；恢复高频动词义。 |
| CET4 | cet4-tall | tall | E | E | P1 | (Tall)人名 | 高的；高大的 | proper_name_only_source | 源记录只给出人名；补入高度形容词义。 |
| CET4 | cet4-tell | tell | S | S | P1 | (Tell)人名；(英、德、瑞典)特尔 | 告诉；讲述；辨别 | proper_name_only_source | 源记录只给出人名；补入传达和辨别义。 |
| CET4 | cet4-ten | ten | D | D | P1 | (Ten)人名 | 十；十个 | proper_name_only_source | 源记录只给出人名；补入基础数词义。 |
| CET4 | cet4-than | than | S | S | P1 | (Than)人名；(老、柬、德)坦 | 比；与其 | proper_name_only_source | 源记录只给出人名；补入比较连接义。 |
| CET4 | cet4-that | that | S | neutral | P3 | (That)人名；(德)塔特 | 那；那个；（引导从句） | function_word_core_anomaly | 补足远指和从句连接两类高频用法。 |
| CET4 | cet4-the | the | S | neutral | P3 | 更加(用于比较级,最高级前) | 这；那；这些；那些（定冠词） | function_word_core_anomaly | 补足阅读中最常用的定冠词指示义，避免只显示形式标签。 |
| CET4 | cet4-their | their | S | neutral | P3 | (Their)人名 | 他们的；她们的；它们的 | function_word_core_anomaly | 明确复数第三人称所有格限定义。 |
| CET4 | cet4-them | them | S | S | P1 | (Them)人名 | 他们；她们；它们（宾格） | proper_name_only_source | 源记录只给出人名；补入复数第三人称宾格义。 |
| CET4 | cet4-these | these | S | neutral | P3 | 这些的 | 这些 | function_word_core_anomaly | 明确复数近指代词和限定词义。 |
| CET4 | cet4-they | they | S | neutral | P3 | 他们 | 他们；她们；它们 | function_word_core_anomaly | 明确复数第三人称指代义。 |
| CET4 | cet4-this | this | S | neutral | P3 | (This)人名 | 这；这个 | function_word_core_anomaly | 明确近指代词和限定词义。 |
| CET4 | cet4-those | those | S | neutral | P3 | 那些的 | 那些 | function_word_core_anomaly | 明确复数远指代词和限定词义。 |
| CET4 | cet4-tight | tight | D | D | P1 | (Tight)人名；(英)泰特 | 紧的；牢固的；严格的 | proper_name_only_source | 源记录只给出人名；补入松紧、牢固和严格义。 |
| CET4 | cet4-to | to | S | neutral | P2 | (To)人名 | 向；到；给；（不定式标记） | function_word_core_anomaly | 核心义混入人名；恢复方向、对象和不定式标记等基础用法。 |
| CET4 | cet4-toward | toward | B | B | P1 | (Toward)人名；(英)特沃德 | 朝；向；对于 | proper_name_only_source | 源记录只给出人名；补入方向和态度对象义。 |
| CET4 | cet4-turn | turn | S | S | P3 | 转弯 | 转动；转弯；变成；轮次 | common_sense_missing | 覆盖动作、变化和名词轮次等高频义。 |
| CET4 | cet4-under | under | S | S | P3 | 下面的；从属的 | 在……下面；低于；在……控制下 | common_sense_missing | 补足位置、数值比较和受控状态等高频用法。 |
| CET4 | cet4-up | up | S | S | P3 | 上升；繁荣 | 向上；在上面；上升 | common_sense_missing | 补足方向、位置和上升等最常见义。 |
| CET4 | cet4-very | very | S | S | P1 | (Very)人名；(英)维里 | 非常；正是；同一的 | proper_name_only_source | 源记录只给出人名；补入程度和强调义。 |
| CET4 | cet4-we | we | S | neutral | P3 | (We)人名 | 我们 | function_word_core_anomaly | 明确基础人称代词义。 |
| CET4 | cet4-with | with | S | S | P1 | (With)人名；(德、芬、丹、瑞典)维特 | 和……一起；带有；用 | proper_name_only_source | 源记录只给出人名；补入伴随、具有和工具义。 |
| CET4 | cet4-work | work | S | S | P3 | 工作；著作 | 工作；起作用；作品；运转 | common_sense_missing | 覆盖劳动、奏效、作品和机器运行等常见义。 |
| CET4 | cet4-worn | worn | D | D | P1 | (Worn)人名；(柬)翁 | 磨损的；疲惫的 | proper_name_only_source | 源记录只给出人名；补入磨损和疲惫状态义。 |
| CET4 | cet4-you | you | S | neutral | P3 | (You)人名 | 你；你们 | function_word_core_anomaly | 明确单数和复数第二人称义。 |
| CET4 | cet4-your | your | S | neutral | P3 | 你的,你们的 | 你的；你们的 | function_word_core_anomaly | 明确第二人称所有格限定义。 |
| CET4 | cet4-bless | bless | C | C | P1 | 祝福；(Bless)人名；(英、意、德、匈)布莱斯 | 祝福 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-careless | careless | E | E | P1 | 粗心的；(Careless)人名；(英)凯尔利斯 | 粗心的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-convenient | convenient | C | C | P4 | 方便的；[废语]适当的 | 方便的；适当的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-divide | divide | C | C | P4 | 分开；除；[地理] 分水岭,分水线 | 分开；除；分水岭,分水线 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-illegal | illegal | D | D | P4 | 不合法的,非法的；非法移民,非法劳工；[法] 非法的 | 不合法的,非法的；非法移民,非法劳工；非法的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-resist | resist | D | D | P4 | 抵抗,抗拒；[助剂] 抗蚀剂；防染剂 | 抵抗,抗拒；抗蚀剂；防染剂 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-tiny | tiny | C | C | P1 | 微小的；(Tiny)人名 | 微小的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-toothache | toothache | E | E | P4 | [口腔] 牙痛；牙痛,牙疼 | 牙痛；牙痛,牙疼 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-virus | virus | E | E | P4 | 病毒；[病毒] 病毒 | 病毒 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-wise | wise | D | D | P1 | (Wise)人名；(英)怀斯；明智的 | 明智的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-rude | rude | D | D | P1 | 粗鲁的；(Rude)人名；(英、西、瑞典)鲁德 | 粗鲁的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-govern | govern | D | D | P1 | 管理；支配；(Govern)人名 | 管理；支配 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-fade | fade | D | D | P4 | 褪色；逐渐消失；[电影][电视] 淡出 | 褪色；逐渐消失；淡出 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-cater | cater | C | C | P1 | 迎合；(Cater)人名；(英)凯特 | 迎合 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-aboard | aboard | E | E | P4 | 在飞机上；[船] 在船上；在……………………上 | 在飞机上；在船上；在……………………上 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-apple | apple | D | D | P4 | 苹果,苹果树,苹果似的东西；[美俚]炸弹,手榴弹,(棒球的)球 | 苹果,苹果树,苹果似的东西；炸弹,手榴弹,(棒球的)球 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-arise | arise | C | C | P1 | 出现；由……………………引起；(Arise)人名 | 出现；由……………………引起 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-arrive | arrive | C | C | P1 | 到达；(Arrive)人名；(法)阿里夫 | 到达 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-baggage | baggage | E | E | P4 | 行李；[交] 辎重(军队的) | 行李；辎重(军队的) | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-bare | bare | E | E | P1 | 赤裸的；(Bare)人名；(英)贝尔 | 赤裸的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-battery | battery | D | D | P4 | 电池；[电] 电池,蓄电池 | 电池；电池,蓄电池 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-beg | beg | D | D | P1 | (Beg)人名；(德、塞、巴基)贝格；乞讨 | 乞讨 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-below | below | C | C | P1 | 在……………………下面；(Below)人名；(英、德、芬、瑞典)贝洛 | 在……………………下面 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-borrow | borrow | C | C | P1 | 借；借用；(Borrow)人名 | 借；借用 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-bury | bury | E | E | P1 | 埋葬；(Bury)人名；(法)比里 | 埋葬 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-camel | camel | E | E | P4 | 骆驼；[畜牧][脊椎] 骆驼；驼色的 | 骆驼；驼色的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-carbon | carbon | D | D | P4 | 碳；[化学] 碳；碳的 | 碳；碳的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-carrier | carrier | E | E | P4 | 带菌者；[化学] 载体 | 带菌者；载体 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-carve | carve | E | E | P1 | 雕刻；切开；(Carve)人名 | 雕刻；切开 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-check | check | B | B | P4 | 检查；<美>支票 | 检查；支票 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-cheese | cheese | E | E | P4 | [食品] 奶酪；干酪 | 奶酪；干酪 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-circuit | circuit | E | E | P4 | 电路；[电子] 电路,回路；环行 | 电路；电路,回路；环行 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-civil | civil | C | C | P1 | 公民的；文职的；(Civil)人名 | 公民的；文职的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-clothing | clothing | C | C | P4 | (总称)[服装] 服装；帆装；覆盖(clothe的ing形式) | (总称) 服装；帆装；覆盖(clothe的ing形式) | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-cubic | cubic | E | E | P1 | 立方的；(Cubic)人名；(罗)库比克 | 立方的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-daughter | daughter | C | C | P4 | 女儿；[遗][农学] 子代 | 女儿；子代 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-depth | depth | C | C | P4 | [海洋] 深度；深奥 | 深度；深奥 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-drown | drown | D | D | P1 | (Drown)人名；(英)德朗；淹没 | 淹没 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-dull | dull | C | C | P1 | 钝的；迟钝的；(Dull)人名 | 钝的；迟钝的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-eager | eager | C | C | P1 | 渴望的, 热切的；(Eager)人名；(英)伊格 | 渴望的, 热切的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-earn | earn | E | E | P1 | (Earn)人名；(泰)炎；赚,赚得 | 赚,赚得 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-entire | entire | C | C | P1 | 全部的,整个的；(Entire)人名；(英)恩泰尔 | 全部的,整个的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-fairly | fairly | D | D | P1 | 公平地；相当；(Fairly)人名 | 公平地；相当 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-fasten | fasten | E | E | P1 | 扎牢, 扣住；(Fasten)人名；(英)法森 | 扎牢, 扣住 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-federal | federal | C | C | P1 | 联邦的；联邦的, 联盟的；(Federal)人名 | 联邦的；联邦的, 联盟的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-fierce | fierce | D | D | P1 | 凶猛的；(Fierce)人名；(英)菲尔斯 | 凶猛的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-fond | fond | D | D | P1 | (Fond)人名；(法)丰；喜欢的 | 喜欢的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-forget | forget | C | C | P1 | (Forget)人名；(法)福尔热；忘记 | 忘记 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-friction | friction | E | E | P4 | 摩擦；摩擦,[力] 摩擦力 | 摩擦；摩擦, 摩擦力 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-glad | glad | D | D | P1 | 高兴的；乐意的；(Glad)人名 | 高兴的；乐意的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-greet | greet | E | E | P1 | (Greet)人名；(英)格里特；欢迎,迎接 | 欢迎,迎接 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-handy | handy | D | D | P1 | 便利的；手边的；(Handy)人名 | 便利的；手边的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-happy | happy | C | C | P1 | 幸福的；(Happy)人名 | 幸福的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-helicopter | helicopter | D | D | P4 | 直升机；[航] 直升飞机；[航] 乘直升飞机 | 直升机；直升飞机；乘直升飞机 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-hydrogen | hydrogen | E | E | P4 | 氢；[化学] 氢 | 氢 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-incident | incident | D | D | P4 | 事件；发生的事, 事件；[光] 入射的 | 事件；发生的事, 事件；入射的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-inventor | inventor | E | E | P4 | 发明家；[专利] 发明人 | 发明家；发明人 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-june | June | E | E | P1 | 六月；琼(人名,来源于拉丁语,含义是“年轻气盛的六月”) | 六月 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-kettle | kettle | E | E | P4 | 壶；[化工] 釜 | 壶；釜 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-kilometre | kilometre | E | E | P4 | [计量] 公里；[计量] 千米 | 公里；千米 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-latter | latter | D | D | P1 | 后者的；(Latter)人名；(英、德、捷)拉特 | 后者的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-lively | lively | D | D | P1 | 活泼的；(Lively)人名；(英)莱夫利 | 活泼的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-load | load | D | D | P4 | 负载,负荷；工作量；[力] 加载 | 负载,负荷；工作量；加载 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-marry | marry | D | D | P1 | 娶,嫁；(Marry)人名；(阿拉伯)马雷 | 娶,嫁 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-modest | modest | C | C | P1 | 羞怯的；谦虚的；(Modest)人名 | 羞怯的；谦虚的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-nail | nail | E | E | P4 | 钉；[解剖] 指甲 | 钉；指甲 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-nice | nice | D | D | P1 | (Nice)人名；(英)尼斯；精密的 | 精密的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-noise | noise | D | D | P4 | 响声；[环境] 噪音 | 响声；噪音 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-none | none | C | C | P1 | 没有人；(None)人名；(葡、罗)诺内 | 没有人 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-nor | nor | C | C | P1 | 也不；(Nor)人名；(中)挪(广东话·威妥玛) | 也不 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-nylon | nylon | E | E | P4 | 尼龙,[纺] 聚酰胺纤维；尼龙袜 | 尼龙, 聚酰胺纤维；尼龙袜 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-obey | obey | E | E | P1 | (Obey)人名；(英、法)奥贝；服从,听从 | 服从,听从 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-october | October | E | E | P4 | [天] 十月；十月 | 十月 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-ours | ours | D | D | P1 | 我们的；(Ours)人名 | 我们的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-owe | owe | D | D | P1 | 欠；应把……………………归功于；(Owe)人名 | 欠；应把……………………归功于 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-pear | pear | E | E | P4 | [园艺] 梨树；梨子 | 梨树；梨子 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-pine | pine | D | D | P4 | 松树,松木；[林] 松树；松木的 | 松树,松木；松树；松木的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-pleasant | pleasant | C | C | P1 | 令人愉快的,舒适的；(Pleasant)人名；(英)普莱曾特 | 令人愉快的,舒适的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-policeman | policeman | E | E | P4 | 警察,警员；[分化] 淀帚(橡皮头玻璃搅棒) | 警察,警员；淀帚(橡皮头玻璃搅棒) | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-potato | potato | D | D | P4 | [作物] 土豆,[作物] 马铃薯；马铃薯,土豆 | 土豆, 马铃薯；马铃薯,土豆 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-pray | pray | D | D | P1 | 祈祷, 祈求；(Pray)人名；(匈)普劳伊 | 祈祷, 祈求 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-precious | precious | D | D | P1 | 珍贵的,宝贵的；(Precious)人名；(英)普雷舍斯,普雷舍丝(女名) | 珍贵的,宝贵的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-proper | proper | D | D | P1 | (Proper)人名；(英、德)普罗珀；适当的 | 适当的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-proud | proud | C | C | P1 | 自豪的；(Proud)人名；(英)普劳德 | 自豪的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-pupil | pupil | C | C | P4 | 学生；[解剖] 瞳孔 | 学生；瞳孔 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-pure | pure | D | D | P1 | 纯粹的；纯洁的；(Pure)人名 | 纯粹的；纯洁的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-radioactive | radioactive | E | E | P4 | 放射性的；[核] 放射性的 | 放射性的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-reply | reply | D | D | P4 | 回答；[法] 答辩 | 回答；答辩 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-rid | rid | C | C | P1 | 使摆脱；(Rid)人名；(英)里德 | 使摆脱 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-ripe | ripe | D | D | P1 | 时机成熟的；熟的；(Ripe)人名 | 时机成熟的；熟的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-smart | smart | C | C | P1 | 巧妙的；(Smart)人名；(法)斯马尔 | 巧妙的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-strange | strange | C | C | P1 | 陌生的；奇怪的；(Strange)人名 | 陌生的；奇怪的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-tour | tour | C | C | P4 | 旅行,游历；[C] 参观, 观光, 旅行 | 旅行,游历；参观, 观光, 旅行 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-towel | towel | E | E | P4 | 毛巾,手巾；[纸] 纸巾；用毛巾擦 | 毛巾,手巾；纸巾；用毛巾擦 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-tyre | tyre | E | E | P4 | 轮胎,车胎；[橡胶] 轮胎；装轮胎于 | 轮胎,车胎；轮胎；装轮胎于 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-upper | upper | C | C | P1 | (Upper)人名；(英)厄珀；上面的,上部的 | 上面的,上部的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-vacant | vacant | D | D | P1 | 空缺的；空的；(Vacant)人名 | 空缺的；空的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-vague | vague | D | D | P1 | 含糊的；不明确的；(Vague)人名 | 含糊的；不明确的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-wander | wander | C | C | P1 | 漫步；迷路；(Wander)人名 | 漫步；迷路 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-willing | willing | C | C | P1 | (Willing)人名；(德、芬、瑞典)维林；乐意的 | 乐意的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-wound | wound | D | D | P4 | 使受伤；创伤,伤口；[C] 创伤 | 使受伤；创伤,伤口；创伤 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-studio | studio | D | D | P4 | 工作室；[广播][电视] 演播室 | 工作室；演播室 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-bloody | bloody | E | E | P4 | [用于加强语气]非常的 | 非常的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-oxygen | oxygen | D | D | P4 | 氧, 氧气；[化学] 氧气,[化学] 氧 | 氧, 氧气；氧气, 氧 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-summary | summary | D | D | P4 | 概要,摘要,总结；[C] 摘要, 概要；简易的 | 概要,摘要,总结；摘要, 概要；简易的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-shallow | shallow | E | E | P4 | 浅的；[地理] 浅滩 | 浅的；浅滩 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-slim | slim | D | D | P1 | 苗条的；微小的；(Slim)人名 | 苗条的；微小的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-superb | superb | E | E | P1 | 极好的；(Superb)人名；(罗)苏佩尔布 | 极好的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-enquiry | enquiry | E | E | P4 | 询问；询问,[贸易] 询盘 | 询问；询问, 询盘 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-cartoon | cartoon | D | D | P4 | 卡通片,[电影] 动画片；连环漫画；为……………………画漫画 | 卡通片, 动画片；连环漫画；为……………………画漫画 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-adolescent | adolescent | E | E | P4 | 青春期的；青少年；[C]青少年 | 青春期的；青少年 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-adore | adore | E | E | P1 | (Adore)人名；(法)阿多尔；崇拜 | 崇拜 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-ample | ample | D | D | P1 | 足够的；宽敞的；(Ample)人名 | 足够的；宽敞的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-apron | apron | E | E | P4 | 围裙；[航] 停机坪 | 围裙；停机坪 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-bacterium | bacterium | E | E | P4 | 细菌；[微] 细菌 | 细菌 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-beddings | beddings | E | E | P4 | 寝具；(建筑)[建] 基床 | 寝具；(建筑) 基床 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-bookcase | bookcase | E | E | P4 | [家具] 书柜,书架 | 书柜,书架 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-chips | chips | D | D | P4 | [食品] 炸土豆条 | 炸土豆条 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-cleaner | cleaner | D | D | P4 | [化工] 清洁剂 | 清洁剂 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-dine | dine | C | C | P1 | (Dine)人名；(意、葡)迪内；进餐,用餐 | 进餐,用餐 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-dizzy | dizzy | E | E | P1 | (Dizzy)人名；(英)迪齐；晕眩的 | 晕眩的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-gale | gale | E | E | P4 | [气象] 大风,狂风 | 大风,狂风 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-irrigation | irrigation | D | D | P4 | 灌溉；[临床] 冲洗 | 灌溉；冲洗 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-litre | litre | D | D | P4 | [计量] 公升(米制容量单位) | 公升(米制容量单位) | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-locust | locust | E | E | P4 | [植保] 蝗虫,[昆] 蚱蜢；蝗虫 | 蝗虫, 蚱蜢；蝗虫 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-offshore | offshore | E | E | P4 | 离岸的；[海洋] 近海的 | 离岸的；近海的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-opener | opener | E | E | P4 | [五金] 开启工具 | 开启工具 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-pineapple | pineapple | E | E | P4 | [园艺] 菠萝；[园艺] 凤梨 | 菠萝；凤梨 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-radium | radium | E | E | P4 | [化学] 镭(88号元素符号Ra)；镭 | 镭(88号元素符号Ra)；镭 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-recipe | recipe | C | C | P4 | 食谱；[临床] 处方 | 食谱；处方 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-relay | relay | E | E | P4 | 转播；[电] 继电器；接替,接替人员 | 转播；继电器；接替,接替人员 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-revision | revision | E | E | P4 | [印刷] 修正；复习 | 修正；复习 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-saleswoman | saleswoman | D | D | P4 | [贸易] 女售货员 | 女售货员 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-see | see | S | S | P1 | 领会；(See)人名 | 领会 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-sit | sit | C | C | P1 | 坐；(Sit)人名 | 坐 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-spaceship | spaceship | D | D | P4 | [航] 宇宙飞船 | 宇宙飞船 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-suitcase | suitcase | E | E | P4 | [轻] 手提箱；衣箱 | 手提箱；衣箱 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-teach | teach | B | B | P1 | 教；(Teach)人名 | 教 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-telegraph | telegraph | E | E | P4 | [通信] 电报机,电报 | 电报机,电报 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-thunderstorm | thunderstorm | E | E | P4 | [气象] 雷暴；雷暴雨 | 雷暴；雷暴雨 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-till | till | E | E | P4 | [地理][水文] 冰碛；放钱的抽屉 | 冰碛；放钱的抽屉 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-tortoise | tortoise | E | E | P4 | 龟,[脊椎] 乌龟(等于testudo)；迟缓的人 | 龟, 乌龟(等于testudo)；迟缓的人 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-typhoon | typhoon | E | E | P4 | [气象] 台风；台风 | 台风 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-unable | unable | B | B | P4 | 不会的,不能的；[劳经] 无能力的 | 不会的,不能的；无能力的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-unmarried | unmarried | D | D | P4 | [法] 未婚的 | 未婚的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-weak | weak | D | D | P4 | 虚弱的；[经] 疲软的 | 虚弱的；疲软的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-yet | yet | S | S | P1 | 还；(Yet)人名 | 还 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-zebra | zebra | E | E | P4 | [脊椎] 斑马；斑马 | 斑马 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET4 | cet4-behaviour | behaviour | C | C | P4 | [U] 行为, 举止 | 行为, 举止 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-urban | urban | B | B | P2 | 住在都市的；都市的,住在都市的；(Urban)人名 | 城市的；都市的 | specialized_sense_promoted | 避免专名或狭窄义占据核心，突出城市属性。 |
| CET6 | cet6-vital | vital | C | C | P2 | 重要的；生命的, 有生命力的；(Vital)人名 | 至关重要的；有生命的 | proper_name_promoted | 核心义混入专名；恢复重要性和生命属性义。 |
| CET6 | cet6-over | over | S | S | P2 | 越过；在……………………之上；超过 | 在……上方；越过；超过；结束 | exam_priority_mismatch | 原核心义碎片化且排序失真；恢复位置、跨越、数量和结束义。 |
| CET6 | cet6-even | even | S | S | P2 | 平坦的；甚至；(Even)人名 | 甚至；平坦的；偶数的 | proper_name_promoted | 核心义混入专名；保留强调、平坦和偶数等常用义。 |
| CET6 | cet6-video | video | C | C | P2 | 录像的；电视的；[电子] 视频 | 视频；录像 | proper_name_promoted | 核心义混入专名；恢复音像内容义。 |
| CET6 | cet6-set | set | S | S | P3 | 集合；一套；树立 | 放置；设置；一套；集合 | common_sense_missing | 覆盖动词和名词的考试常见义，避免只保留单一义项。 |
| CET6 | cet6-hard | hard | A | A | P2 | 硬的；困难的；(Hard)人名 | 困难的；坚硬的；努力地 | proper_name_promoted | 核心义混入专名；恢复难度、物理性质和努力程度义。 |
| CET6 | cet6-legal | legal | B | B | P2 | 法律的；合法的；(Legal)人名 | 法律的；合法的 | specialized_sense_promoted | 避免专门法律术语占据核心，突出一般法律属性和合法性。 |
| CET6 | cet6-afford | afford | C | C | P2 | 提供；担负得起……………………；(Afford)人名 | 买得起；承担得起；提供 | proper_name_promoted | 核心义混入专名；恢复经济承受和提供义。 |
| CET6 | cet6-culture | culture | A | A | P2 | 文化,文明；教养；[细胞][微] 培养(等于cultivate) | 文化；文明；培养 | specialized_sense_promoted | 核心义偏向专业培养义；突出社会文化义并保留培养义。 |
| CET6 | cet6-demand | demand | A | A | P2 | 要求；需要；[经] 需求 | 要求；需要；需求 | specialized_sense_promoted | 核心义偏向专门术语；恢复一般要求和需求义。 |
| CET6 | cet6-argue | argue | A | A | P2 | 说服；争论,争辩,辩论；(Argue)人名 | 争论；论证；主张 | proper_name_promoted | 核心义混入专名；恢复争论和论证义。 |
| CET6 | cet6-aware | aware | B | B | P2 | 知道的, 意识到的；(Aware)人名；(阿拉伯、索)阿瓦雷 | 知道的；意识到的 | proper_name_promoted | 核心义混入专名；恢复认知状态义。 |
| CET6 | cet6-ensure | ensure | S | S | P2 | 保证；保护 | 确保；保证 | misleading_core_sense | 删除会误导作答的“保护”，只保留 ensure 的核心保证义。 |
| CET6 | cet6-suffer | suffer | A | A | P2 | (Suffer)人名；(意)苏费尔；遭受 | 遭受；忍受；受苦 | proper_name_promoted | 核心义混入专名；恢复遭受和受苦义。 |
| CET6 | cet6-a | a | S | neutral | P2 | 字母A；第一流的 | 一个；一（用于单数可数名词前） | function_word_core_anomaly | 最高频冠词的核心义被字母名称和等级义占据；恢复基础冠词义。 |
| CET6 | cet6-able | able | S | S | P2 | 有能力的；(Able)人名；(伊朗)阿布勒 | 有能力的；能干的 | proper_name_promoted | 核心义混入专名；恢复能力形容词义。 |
| CET6 | cet6-ago | ago | B | B | P2 | (Ago)人名；(英、西、意、塞、瑞典)阿戈 | 以前 | proper_name_promoted | 核心义混入专名；恢复时间副词义。 |
| CET6 | cet6-also | also | S | S | P2 | 也；(Also)人名；(罗)阿尔索 | 也；而且 | proper_name_promoted | 核心义混入专名；恢复补充和递进副词义。 |
| CET6 | cet6-and | and | S | neutral | P2 | (And)人名；(土、瑞典)安德 | 和；与；而且 | proper_name_promoted | 核心义混入人名；恢复并列和递进连接义。 |
| CET6 | cet6-any | any | S | S | P2 | 任何的；任何一个；(Any)人名 | 任何的；任一；一些 | proper_name_promoted | 核心义混入专名；恢复限定词和代词用法。 |
| CET6 | cet6-as | as | S | neutral | P3 | 因为；当……………………时；同样地 | 作为；像；当……时；因为 | function_word_core_anomaly | 补足角色、比较、时间和原因等高频连接义。 |
| CET6 | cet6-ask | ask | A | A | P2 | 要求；邀请；(Ask)人名 | 询问；请求；要求；邀请 | proper_name_promoted | 核心义混入专名；恢复询问和请求等高频义。 |
| CET6 | cet6-at | at | S | neutral | P3 | 阿特(老挝货币基本单位att)；砹(极不稳定放射性元素)；在(表示存在或出现的地点、场所、位置、空间) | 在；向；以（价格、速度等） | function_word_core_anomaly | 补足地点、方向和比率等常用介词义。 |
| CET6 | cet6-be | be | S | neutral | P2 | (Be)人名；(缅)拜 | 是；存在；成为 | proper_name_promoted | 核心义混入专名；恢复系动词和存在义。 |
| CET6 | cet6-begin | begin | S | S | P2 | 开始；(Begin)人名；(以、德)贝京 | 开始 | proper_name_promoted | 核心义混入专名；恢复开始义。 |
| CET6 | cet6-big | big | A | A | P2 | (Big)人名；(土)比格 | 大的；重要的；重大的 | proper_name_promoted | 核心义混入专名；恢复尺寸和重要性义。 |
| CET6 | cet6-born | born | C | C | P2 | 天生的；出生的；(Born)人名 | 出生的；天生的 | proper_name_promoted | 核心义混入专名；恢复出生和先天属性义。 |
| CET6 | cet6-both | both | S | S | P2 | 两者都；双方都；(Both)人名 | 两者都；双方 | proper_name_promoted | 核心义混入专名；恢复两者共同指代义。 |
| CET6 | cet6-bring | bring | A | A | P2 | 带来；促使；(Bring)人名 | 带来；拿来；引起 | proper_name_promoted | 核心义混入专名；恢复移动和导致义。 |
| CET6 | cet6-busy | busy | C | C | P2 | 忙碌的；(Busy)人名；(匈)布希 | 忙碌的；繁忙的；占线的 | proper_name_promoted | 核心义混入专名；恢复人员、地点和线路状态义。 |
| CET6 | cet6-but | but | S | neutral | P3 | 但是,可是；(But)人名；(俄、罗)布特 | 但是；除……之外 | function_word_core_anomaly | 补足转折和排除两类常见用法。 |
| CET6 | cet6-by | by | S | neutral | P3 | 被；通过；经过 | 由；被；通过；在……旁边 | function_word_core_anomaly | 补足施事、方式和位置等基础介词义。 |
| CET6 | cet6-certain | certain | A | A | P2 | (Certain)人名；(葡)塞尔塔因；某一 | 确定的；某一；某些 | proper_name_promoted | 核心义混入专名；恢复确定性和非特指限定义。 |
| CET6 | cet6-collect | collect | B | B | P2 | 收集；(Collect)人名；(英)科莱克特 | 收集；领取；募捐 | proper_name_promoted | 核心义混入专名；恢复收集、领取和筹集义。 |
| CET6 | cet6-come | come | S | S | P2 | 出现；变成；(Come)人名 | 来；到达；出现；变成 | proper_name_promoted | 核心义混入专名；恢复移动、出现和变化义。 |
| CET6 | cet6-differ | differ | B | B | P2 | 不同,相异；(Differ)人名；(法)迪费 | 不同；有区别 | proper_name_promoted | 核心义混入专名；恢复差异义。 |
| CET6 | cet6-do | do | S | neutral | P3 | 用以构成疑问句及否定句；做,干 | 做；干；助动词 | function_word_core_anomaly | 补足实义动词和助动词两种最高频用法。 |
| CET6 | cet6-down | down | S | S | P1 | 软毛,绒毛；[地质] 开阔的高地 | 向下；往下；在下面；下降 | rare_sense_promoted | 原核心义只显示“软毛/高地”等罕见名词义；恢复方向和下降义，同时将罕见义保留在详细义项。 |
| CET6 | cet6-during | during | S | S | P2 | (During)人名；(法)迪兰；在……………………的时候,在……………………的期间 | 在……期间 | proper_name_promoted | 核心义混入专名；恢复时间介词义。 |
| CET6 | cet6-early | early | A | A | P2 | 早的,早期的；(Early)人名；(英)厄尔利 | 早的；早期的；提前 | proper_name_promoted | 核心义混入专名；恢复时间形容词和副词义。 |
| CET6 | cet6-else | else | B | B | P2 | 别的；(Else)人名；(英)埃尔斯 | 其他的；另外 | proper_name_promoted | 核心义混入专名；恢复补充和替代义。 |
| CET6 | cet6-ever | ever | S | S | P2 | 曾经；(Ever)人名；(英)埃弗 | 曾经；始终；究竟 | proper_name_promoted | 核心义混入专名；恢复时间和强调副词义。 |
| CET6 | cet6-every | every | S | S | P2 | 每隔……………………的；(Every)人名；(英)埃夫里 | 每个；每一 | proper_name_promoted | 核心义混入专名；恢复全称限定义。 |
| CET6 | cet6-for | for | S | neutral | P3 | 因为；给 | 为了；给；对于；因为 | function_word_core_anomaly | 补足目的、对象和原因等考试高频用法。 |
| CET6 | cet6-four | four | S | S | P2 | (Four)人名；(西)福尔 | 四；四个 | proper_name_promoted | 核心义混入专名；恢复基础数词义。 |
| CET6 | cet6-free | free | A | A | P2 | 免费的；(Free)人名；(英)弗里 | 免费的；自由的；空闲的 | proper_name_promoted | 核心义混入专名；恢复价格、自由和时间状态义。 |
| CET6 | cet6-friendly | friendly | C | C | P2 | 友好的；(Friendly)人名；(英)弗兰德利 | 友好的；友善的 | proper_name_promoted | 核心义混入专名；恢复态度和关系义。 |
| CET6 | cet6-get | get | S | S | P1 | 到达；生殖；幼兽 | 得到；到达；变得；理解 | rare_sense_promoted | 原核心义被“生殖/幼兽”等罕见名词义污染；恢复高频动词义。 |
| CET6 | cet6-golden | golden | D | D | P1 | (Golden)人名；(英、法、罗、德、瑞典)戈尔登 | 金色的；黄金般的；极好的 | proper_name_only_source | 源记录只给出人名；补入四六级常用形容词义并把人名留在详细义项。 |
| CET6 | cet6-grow | grow | S | S | P2 | 生长；(Grow)人名；(英)格罗 | 生长；增长；种植；逐渐变得 | proper_name_promoted | 核心义混入专名；恢复生长、增加、种植和变化义。 |
| CET6 | cet6-have | have | S | neutral | P3 | 有；(Have)人名；(芬)哈韦 | 有；拥有；已经（助动词） | function_word_core_anomaly | 补足拥有义和完成时助动词用法。 |
| CET6 | cet6-he | he | S | neutral | P3 | 男孩,男人；它(雄性动物) | 他 | function_word_core_anomaly | 明确基础人称代词义。 |
| CET6 | cet6-her | her | S | neutral | P3 | (法)埃尔(人名)；她(she的宾格) | 她；她的 | function_word_core_anomaly | 补足宾格和所有格限定词两种基础用法。 |
| CET6 | cet6-hers | hers | E | E | P1 | (Hers)人名；(法)埃尔 | 她的（所有格代词） | proper_name_only_source | 源记录只给出人名；补入第三人称女性所有格代词义。 |
| CET6 | cet6-hi | hi | E | E | P1 | (Hi)人名；(柬)希 | 嗨；你好 | proper_name_only_source | 源记录只给出人名；补入常用问候语义。 |
| CET6 | cet6-him | him | B | B | P2 | (Him)人名；(东南亚国家华语)欣 | 他（宾格） | proper_name_promoted | 核心义混入专名；恢复第三人称男性宾格义。 |
| CET6 | cet6-his | his | S | neutral | P2 | (His)人名；(法)伊斯 | 他的 | proper_name_promoted | 核心义混入专名；恢复第三人称男性所有格义。 |
| CET6 | cet6-hold | hold | A | A | P3 | 拥有；控制；保留 | 拿着；保持；举行；容纳 | common_sense_missing | 补足拿持、保持、举办和容纳等高频动词义。 |
| CET6 | cet6-huge | huge | B | B | P2 | (Huge)人名；(英)休奇 | 巨大的 | proper_name_promoted | 核心义混入专名；恢复尺寸和程度义。 |
| CET6 | cet6-if | if | S | neutral | P3 | 条件；设想 | 如果；是否 | function_word_core_anomaly | 补足条件从句和间接疑问的基础义。 |
| CET6 | cet6-in | in | S | neutral | P2 | 执政者；门路 | 在……里面；进入；处于 | function_word_core_anomaly | 核心义被“执政者/门路”等低频名词义占据；恢复基础介词义。 |
| CET6 | cet6-into | into | S | S | P2 | (Into)人名；(芬、英)因托 | 进入；到……里面；变成 | proper_name_promoted | 核心义混入专名；恢复方向和状态变化义。 |
| CET6 | cet6-it | it | S | neutral | P2 | [指无生命的东西、动物、植物]它；这 | 它；这；那 | proper_name_promoted | 核心义混入专名；恢复第三人称和形式主语常用指代义。 |
| CET6 | cet6-its | its | S | S | P2 | 它的；(Its)人名 | 它的 | proper_name_promoted | 核心义混入专名；恢复第三人称中性所有格义。 |
| CET6 | cet6-just | just | S | S | P2 | (Just)人名；(英)贾斯特；公正的,合理的 | 正好；刚才；公正的；仅仅 | proper_name_promoted | 核心义混入专名；恢复时间、程度和公正义。 |
| CET6 | cet6-later | later | A | A | P2 | 后来；(Later)人名 | 后来；较晚的 | proper_name_promoted | 核心义混入专名；恢复时间先后义。 |
| CET6 | cet6-lazy | lazy | E | E | P1 | (Lazy)人名；(德)拉齐 | 懒惰的；懒散的 | proper_name_only_source | 源记录只给出人名；补入常用形容词义。 |
| CET6 | cet6-learned | learned | S | S | P2 | 有学问的；学术上的；(Learned)人名 | 有学问的；博学的 | proper_name_promoted | 核心义混入专名；恢复知识丰富的形容词义。 |
| CET6 | cet6-left | left | B | B | P3 | 左边的；左边；左派 | 左边的；左边；剩下的 | common_sense_missing | 补足方向义和 leave 的过去分词状态义。 |
| CET6 | cet6-lend | lend | D | D | P1 | (Lend)人名；(德)伦德 | 借给；贷款给 | proper_name_only_source | 源记录只给出人名；补入借出和提供贷款义。 |
| CET6 | cet6-live | live | S | S | P2 | 活的；(Live)人名；(法)利夫 | 生活；居住；活的；现场直播的 | proper_name_promoted | 核心义混入专名；恢复生活、居住、存活和直播义。 |
| CET6 | cet6-lose | lose | A | A | P2 | (Lose)人名；(英)洛斯；浪费 | 失去；输掉；迷失；浪费 | proper_name_promoted | 核心义混入专名；恢复失去、失败和迷失等高频义。 |
| CET6 | cet6-loud | loud | D | D | P1 | (Loud)人名；(英)劳德 | 大声的；响亮的 | proper_name_only_source | 源记录只给出人名；补入声音强度义。 |
| CET6 | cet6-make | make | S | S | P3 | 制造；构造；使得 | 制造；使得；成为；赚得 | common_sense_missing | 补足制造、使役、变化和收入等常用动词义。 |
| CET6 | cet6-mean | mean | A | A | P1 | 平均值；平均的；卑鄙的 | 意思是；意味着；平均的；吝啬的 | rare_sense_promoted | 原核心义遗漏最常用动词义并突出“平均值/卑鄙”；恢复“意思是/意味着”。 |
| CET6 | cet6-my | my | A | neutral | P2 | 我的；(My)人名 | 我的 | proper_name_promoted | 核心义混入专名；恢复第一人称所有格限定义。 |
| CET6 | cet6-new | new | S | S | P2 | (New)人名；(英)纽 | 新的；新出现的；新鲜的 | proper_name_promoted | 核心义混入专名；恢复常用形容词义。 |
| CET6 | cet6-of | of | S | neutral | P3 | ……………………的；关于 | ……的；关于；属于 | function_word_core_anomaly | 补足所属和相关关系的高频介词义。 |
| CET6 | cet6-off | off | A | A | P3 | 远离的；空闲的；切断 | 离开；关掉；停止；休息的 | common_sense_missing | 补足离开、关闭、停止和休息状态等常用义。 |
| CET6 | cet6-on | on | S | neutral | P2 | 关于；在…………………………………………时候；(On)人名 | 在……上；关于；继续 | function_word_core_anomaly | 清除核心位置中的专名干扰，突出位置、主题和持续义。 |
| CET6 | cet6-or | or | S | neutral | P3 | 或,或者；(Or)人名；(中)柯(广东话·威妥玛) | 或者；否则 | function_word_core_anomaly | 补足选择和条件后果的常用连接义。 |
| CET6 | cet6-out | out | S | S | P2 | 出局；外面的 | 向外；在外；出去；不在 | exam_priority_mismatch | 原核心义偏向“出局/外面的”；恢复阅读中更常用的方向和状态义。 |
| CET6 | cet6-owner | owner | C | C | P2 | 物主,所有人；[经] 所有者 | 所有者；物主 | proper_name_promoted | 核心义混入专名；恢复所有权主体义。 |
| CET6 | cet6-per | per | B | B | P2 | 每；(Per)人名；(德、挪、丹、瑞典)佩尔 | 每；每一 | proper_name_promoted | 核心义混入专名；恢复比率介词义。 |
| CET6 | cet6-poor | poor | S | S | P2 | 贫穷的；贫乏的；(Poor)人名 | 贫穷的；差的；不足的 | proper_name_promoted | 核心义混入专名；恢复经济、质量和数量不足义。 |
| CET6 | cet6-rainy | rainy | D | D | P1 | (Rainy)人名；(英)雷尼 | 多雨的；下雨的 | proper_name_only_source | 源记录只给出人名；补入天气形容词义。 |
| CET6 | cet6-rather | rather | S | S | P2 | 宁可,宁愿；相当；(Rather)人名 | 相当；宁愿；而不是 | proper_name_promoted | 核心义混入专名；恢复程度和偏好等常用结构义。 |
| CET6 | cet6-say | say | S | S | P2 | (Say)人名；(土)萨伊；讲 | 说；讲；表示 | proper_name_promoted | 核心义混入专名；恢复表达和陈述义。 |
| CET6 | cet6-truly | truly | B | B | P2 | (Truly)人名；(英)特鲁利 | 真正地；确实 | proper_name_promoted | 核心义混入专名；恢复真实性和强调义。 |
| CET6 | cet6-battery | battery | D | D | P4 | 电池；[电] 电池,蓄电池 | 电池；电池,蓄电池 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-check | check | B | B | P4 | 检查；<美>支票 | 检查；支票 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-drown | drown | D | D | P1 | (Drown)人名；(英)德朗；淹没 | 淹没 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-elite | elite | C | C | P4 | 精英；[总称] 上层人士, 掌权人物, 实力集团 | 精英；上层人士, 掌权人物, 实力集团 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-fade | fade | C | C | P4 | 褪色；逐渐消失；[电影][电视] 淡出 | 褪色；逐渐消失；淡出 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-fierce | fierce | D | D | P1 | 凶猛的；(Fierce)人名；(英)菲尔斯 | 凶猛的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-genetic | genetic | C | C | P4 | [-s]遗传学；基因的 | 遗传学；基因的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-govern | govern | D | D | P1 | 管理；支配；(Govern)人名 | 管理；支配 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-owe | owe | C | C | P1 | 欠；应把……………………归功于；(Owe)人名 | 欠；应把……………………归功于 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-recipe | recipe | C | C | P4 | 食谱；[临床] 处方 | 食谱；处方 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-resist | resist | C | C | P4 | 抵抗,抗拒；[助剂] 抗蚀剂；防染剂 | 抵抗,抗拒；抗蚀剂；防染剂 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-slim | slim | E | E | P1 | 苗条的；微小的；(Slim)人名 | 苗条的；微小的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-virus | virus | C | C | P4 | 病毒；[病毒] 病毒 | 病毒 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-helicopter | helicopter | E | E | P4 | 直升机；[航] 直升飞机；[航] 乘直升飞机 | 直升机；直升飞机；乘直升飞机 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-relay | relay | E | E | P4 | 转播；[电] 继电器；接替,接替人员 | 转播；继电器；接替,接替人员 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-cater | cater | D | D | P1 | 迎合；(Cater)人名；(英)凯特 | 迎合 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-arise | arise | C | C | P1 | 出现；由……………………引起；(Arise)人名 | 出现；由……………………引起 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-irrigation | irrigation | D | D | P4 | 灌溉；[临床] 冲洗 | 灌溉；冲洗 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-ample | ample | C | C | P1 | 足够的；宽敞的；(Ample)人名 | 足够的；宽敞的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-superb | superb | E | E | P1 | 极好的；(Superb)人名；(罗)苏佩尔布 | 极好的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-suitcase | suitcase | E | E | P4 | [轻] 手提箱；衣箱 | 手提箱；衣箱 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-nice | nice | D | D | P1 | (Nice)人名；(英)尼斯；精密的 | 精密的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-bacterium | bacterium | D | D | P4 | 细菌；[微] 细菌 | 细菌 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-strange | strange | C | C | P1 | 陌生的；奇怪的；(Strange)人名 | 陌生的；奇怪的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-dizzy | dizzy | D | D | P1 | (Dizzy)人名；(英)迪齐；晕眩的 | 晕眩的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-cartoon | cartoon | E | E | P4 | 卡通片,[电影] 动画片；连环漫画；为……………………画漫画 | 卡通片, 动画片；连环漫画；为……………………画漫画 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-cubic | cubic | E | E | P1 | 立方的；(Cubic)人名；(罗)库比克 | 立方的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-locust | locust | E | E | P4 | [植保] 蝗虫,[昆] 蚱蜢；蝗虫 | 蝗虫, 蚱蜢；蝗虫 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-proper | proper | C | C | P1 | (Proper)人名；(英、德)普罗珀；适当的 | 适当的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-commonwealth | commonwealth | D | D | P4 | 联邦；[C-]英联邦 | 联邦；英联邦 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-studio | studio | D | D | P4 | 工作室；[广播][电视] 演播室 | 工作室；演播室 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-summary | summary | D | D | P4 | 概要,摘要,总结；[C] 摘要, 概要；简易的 | 概要,摘要,总结；摘要, 概要；简易的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-pineapple | pineapple | D | D | P4 | [园艺] 菠萝；[园艺] 凤梨 | 菠萝；凤梨 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-handy | handy | E | E | P1 | 便利的；手边的；(Handy)人名 | 便利的；手边的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-smart | smart | C | C | P1 | 巧妙的；(Smart)人名；(法)斯马尔 | 巧妙的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-adore | adore | D | D | P1 | (Adore)人名；(法)阿多尔；崇拜 | 崇拜 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-dine | dine | D | D | P1 | (Dine)人名；(意、葡)迪内；进餐,用餐 | 进餐,用餐 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-friction | friction | E | E | P4 | 摩擦；摩擦,[力] 摩擦力 | 摩擦；摩擦, 摩擦力 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-incident | incident | D | D | P4 | 事件；发生的事, 事件；[光] 入射的 | 事件；发生的事, 事件；入射的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-illegal | illegal | D | D | P4 | 不合法的,非法的；非法移民,非法劳工；[法] 非法的 | 不合法的,非法的；非法移民,非法劳工；非法的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-radioactive | radioactive | D | D | P4 | 放射性的；[核] 放射性的 | 放射性的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-vacant | vacant | E | E | P1 | 空缺的；空的；(Vacant)人名 | 空缺的；空的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-oxygen | oxygen | D | D | P4 | 氧, 氧气；[化学] 氧气,[化学] 氧 | 氧, 氧气；氧气, 氧 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-adolescent | adolescent | C | C | P4 | 青春期的；青少年；[C]青少年 | 青春期的；青少年 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-federal | federal | C | C | P1 | 联邦的；联邦的, 联盟的；(Federal)人名 | 联邦的；联邦的, 联盟的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-vague | vague | E | E | P1 | 含糊的；不明确的；(Vague)人名 | 含糊的；不明确的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-modest | modest | D | D | P1 | 羞怯的；谦虚的；(Modest)人名 | 羞怯的；谦虚的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-carve | carve | D | D | P1 | 雕刻；切开；(Carve)人名 | 雕刻；切开 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-precious | precious | C | C | P1 | 珍贵的,宝贵的；(Precious)人名；(英)普雷舍斯,普雷舍丝(女名) | 珍贵的,宝贵的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-bless | bless | E | E | P1 | 祝福；(Bless)人名；(英、意、德、匈)布莱斯 | 祝福 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-careless | careless | D | D | P1 | 粗心的；(Careless)人名；(英)凯尔利斯 | 粗心的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-convenient | convenient | C | C | P4 | 方便的；[废语]适当的 | 方便的；适当的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-divide | divide | A | A | P4 | 分开；除；[地理] 分水岭,分水线 | 分开；除；分水岭,分水线 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-tiny | tiny | A | A | P1 | 微小的；(Tiny)人名 | 微小的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-toothache | toothache | E | E | P4 | [口腔] 牙痛；牙痛,牙疼 | 牙痛；牙痛,牙疼 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-wise | wise | D | D | P1 | (Wise)人名；(英)怀斯；明智的 | 明智的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-rude | rude | D | D | P1 | 粗鲁的；(Rude)人名；(英、西、瑞典)鲁德 | 粗鲁的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-aboard | aboard | E | E | P4 | 在飞机上；[船] 在船上；在……………………上 | 在飞机上；在船上；在……………………上 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-apple | apple | D | D | P4 | 苹果,苹果树,苹果似的东西；[美俚]炸弹,手榴弹,(棒球的)球 | 苹果,苹果树,苹果似的东西；炸弹,手榴弹,(棒球的)球 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-arrive | arrive | C | C | P1 | 到达；(Arrive)人名；(法)阿里夫 | 到达 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-baggage | baggage | D | D | P4 | 行李；[交] 辎重(军队的) | 行李；辎重(军队的) | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-bare | bare | E | E | P1 | 赤裸的；(Bare)人名；(英)贝尔 | 赤裸的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-beg | beg | E | E | P1 | (Beg)人名；(德、塞、巴基)贝格；乞讨 | 乞讨 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-below | below | C | C | P1 | 在……………………下面；(Below)人名；(英、德、芬、瑞典)贝洛 | 在……………………下面 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-borrow | borrow | C | C | P1 | 借；借用；(Borrow)人名 | 借；借用 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-bury | bury | D | D | P1 | 埋葬；(Bury)人名；(法)比里 | 埋葬 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-camel | camel | E | E | P4 | 骆驼；[畜牧][脊椎] 骆驼；驼色的 | 骆驼；驼色的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-carbon | carbon | C | C | P4 | 碳；[化学] 碳；碳的 | 碳；碳的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-carrier | carrier | E | E | P4 | 带菌者；[化学] 载体 | 带菌者；载体 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-cheese | cheese | E | E | P4 | [食品] 奶酪；干酪 | 奶酪；干酪 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-circuit | circuit | D | D | P4 | 电路；[电子] 电路,回路；环行 | 电路；电路,回路；环行 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-civil | civil | C | C | P1 | 公民的；文职的；(Civil)人名 | 公民的；文职的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-clothing | clothing | C | C | P4 | (总称)[服装] 服装；帆装；覆盖(clothe的ing形式) | (总称) 服装；帆装；覆盖(clothe的ing形式) | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-daughter | daughter | D | D | P4 | 女儿；[遗][农学] 子代 | 女儿；子代 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-depth | depth | D | D | P4 | [海洋] 深度；深奥 | 深度；深奥 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-dull | dull | E | E | P1 | 钝的；迟钝的；(Dull)人名 | 钝的；迟钝的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-eager | eager | D | D | P1 | 渴望的, 热切的；(Eager)人名；(英)伊格 | 渴望的, 热切的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-earn | earn | A | A | P1 | (Earn)人名；(泰)炎；赚,赚得 | 赚,赚得 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-entire | entire | B | B | P1 | 全部的,整个的；(Entire)人名；(英)恩泰尔 | 全部的,整个的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-fairly | fairly | C | C | P1 | 公平地；相当；(Fairly)人名 | 公平地；相当 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-fasten | fasten | E | E | P1 | 扎牢, 扣住；(Fasten)人名；(英)法森 | 扎牢, 扣住 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-fond | fond | D | D | P1 | (Fond)人名；(法)丰；喜欢的 | 喜欢的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-forget | forget | C | C | P1 | (Forget)人名；(法)福尔热；忘记 | 忘记 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-glad | glad | E | E | P1 | 高兴的；乐意的；(Glad)人名 | 高兴的；乐意的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-greet | greet | D | D | P1 | (Greet)人名；(英)格里特；欢迎,迎接 | 欢迎,迎接 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-happy | happy | C | C | P1 | 幸福的；(Happy)人名 | 幸福的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-hydrogen | hydrogen | E | E | P4 | 氢；[化学] 氢 | 氢 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-inventor | inventor | D | D | P4 | 发明家；[专利] 发明人 | 发明家；发明人 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-june | June | E | E | P1 | 六月；琼(人名,来源于拉丁语,含义是“年轻气盛的六月”) | 六月 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-kettle | kettle | E | E | P4 | 壶；[化工] 釜 | 壶；釜 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-kilometre | kilometre | E | E | P4 | [计量] 公里；[计量] 千米 | 公里；千米 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-latter | latter | C | C | P1 | 后者的；(Latter)人名；(英、德、捷)拉特 | 后者的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-lively | lively | E | E | P1 | 活泼的；(Lively)人名；(英)莱夫利 | 活泼的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-load | load | C | C | P4 | 负载,负荷；工作量；[力] 加载 | 负载,负荷；工作量；加载 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-marry | marry | E | E | P1 | 娶,嫁；(Marry)人名；(阿拉伯)马雷 | 娶,嫁 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-nail | nail | E | E | P4 | 钉；[解剖] 指甲 | 钉；指甲 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-noise | noise | D | D | P4 | 响声；[环境] 噪音 | 响声；噪音 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-none | none | C | C | P1 | 没有人；(None)人名；(葡、罗)诺内 | 没有人 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-nor | nor | C | C | P1 | 也不；(Nor)人名；(中)挪(广东话·威妥玛) | 也不 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-nylon | nylon | E | E | P4 | 尼龙,[纺] 聚酰胺纤维；尼龙袜 | 尼龙, 聚酰胺纤维；尼龙袜 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-obey | obey | D | D | P1 | (Obey)人名；(英、法)奥贝；服从,听从 | 服从,听从 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-october | October | C | C | P4 | [天] 十月；十月 | 十月 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-ours | ours | C | C | P1 | 我们的；(Ours)人名 | 我们的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-pear | pear | E | E | P4 | [园艺] 梨树；梨子 | 梨树；梨子 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-pine | pine | E | E | P4 | 松树,松木；[林] 松树；松木的 | 松树,松木；松树；松木的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-pleasant | pleasant | C | C | P1 | 令人愉快的,舒适的；(Pleasant)人名；(英)普莱曾特 | 令人愉快的,舒适的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-policeman | policeman | E | E | P4 | 警察,警员；[分化] 淀帚(橡皮头玻璃搅棒) | 警察,警员；淀帚(橡皮头玻璃搅棒) | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-potato | potato | D | D | P4 | [作物] 土豆,[作物] 马铃薯；马铃薯,土豆 | 土豆, 马铃薯；马铃薯,土豆 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-pray | pray | D | D | P1 | 祈祷, 祈求；(Pray)人名；(匈)普劳伊 | 祈祷, 祈求 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-proud | proud | C | C | P1 | 自豪的；(Proud)人名；(英)普劳德 | 自豪的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-pupil | pupil | D | D | P4 | 学生；[解剖] 瞳孔 | 学生；瞳孔 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-pure | pure | C | C | P1 | 纯粹的；纯洁的；(Pure)人名 | 纯粹的；纯洁的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-reply | reply | D | D | P4 | 回答；[法] 答辩 | 回答；答辩 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-rid | rid | C | C | P1 | 使摆脱；(Rid)人名；(英)里德 | 使摆脱 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-ripe | ripe | D | D | P1 | 时机成熟的；熟的；(Ripe)人名 | 时机成熟的；熟的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-tour | tour | E | E | P4 | 旅行,游历；[C] 参观, 观光, 旅行 | 旅行,游历；参观, 观光, 旅行 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-towel | towel | D | D | P4 | 毛巾,手巾；[纸] 纸巾；用毛巾擦 | 毛巾,手巾；纸巾；用毛巾擦 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-tyre | tyre | E | E | P4 | 轮胎,车胎；[橡胶] 轮胎；装轮胎于 | 轮胎,车胎；轮胎；装轮胎于 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-upper | upper | C | C | P1 | (Upper)人名；(英)厄珀；上面的,上部的 | 上面的,上部的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-wander | wander | C | C | P1 | 漫步；迷路；(Wander)人名 | 漫步；迷路 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-willing | willing | C | C | P1 | (Willing)人名；(德、芬、瑞典)维林；乐意的 | 乐意的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-wound | wound | E | E | P4 | 使受伤；创伤,伤口；[C] 创伤 | 使受伤；创伤,伤口；创伤 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-bloody | bloody | D | D | P4 | [用于加强语气]非常的 | 非常的 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-shallow | shallow | D | D | P4 | 浅的；[地理] 浅滩 | 浅的；浅滩 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |
| CET6 | cet6-enquiry | enquiry | E | E | P4 | 询问；询问,[贸易] 询盘 | 询问；询问, 询盘 | systematic_core_noise_filter | 从核心展示中移除人名/地名或来源专业标签；原始义项仍保留在详细释义中。 |

## 待人工确认候选

以下项目仅由结构/文本信号筛出，本阶段不猜测、不批量改写。JSON 报告保留完整字段和详细义项。

| 风险 | 词库 | ID | 单词 | 核心词 | raw tier | 核心义 | 信号 |
| --- | --- | --- | --- | --- | --- | --- | --- |

## 不变性结论

- CET4/CET6 的词数、核心/补充数量与 ID 集合保持不变。
- 真题词频 JSON、SMART/random/neutral 顺序逻辑、长期 SRS、Recovery、自然日窗口、Phase 16 分组与休息、Worker 均未修改。
- storage version 保持 v13，无迁移；用户学习记录不会被清空或重置。
- 详细 SHA-256、ID hash、逐条修复和待确认字段见 `data/core-meaning-audit-report.json`。

## 风险分级

- P0：明显错误核心义。
- P1：罕见义或专有名词被提升为核心义。
- P2：核心义包含错误或误导义项。
- P3：核心义过窄，只保留次要义或遗漏常见词性。
- P4：释义本身真实，但不适合四六级优先学习。
