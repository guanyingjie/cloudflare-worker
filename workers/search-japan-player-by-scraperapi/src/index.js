/**
 * Cloudflare Worker: Kyureki Finder (Yahoo Japan Edition) - 提取球员信息版本
 */

// 🎯 精选人名映射表 (仅保留人名常用字，约120个)
const CN_JP_MAP = {
    // --- 顶级高频 (姓氏/名字核心字) ---
    '泽': '沢', '岛': '島', '广': '廣', '边': '辺', '齐': '斉',
    '斋': '斎', '滨': '浜', '关': '関', '冈': '岡', '宫': '宮',
    '泷': '滝', '荣': '栄', '卫': '衛', '礼': '禮', '万': '萬','垒':'塁',
    // ... (保留你原有的完整映射表) ...
    '气': '気', '实': '実', '惠': '恵', '丰': '豊', '乐': '楽',
    '亚': '亜', '恶': '悪', '圆': '円', '艳': '艶', '樱': '桜',
    '应': '応', '归': '帰', '龟': '亀', '义': '義', '菊': '菊',
    '吉': '吉', '举': '挙', '旧': '旧', '巨': '巨', '与': '與',
    '龙': '竜', '宽': '寛', '户': '戸', '庆': '慶', '伦': '倫',
    '伟': '偉', '仪': '儀', '优': '優', '勋': '勲', '华': '華',
    '发': '発', '启': '啓', '园': '園', '圣': '聖', '坚': '堅',
    '增': '増', '寿': '寿', '奖': '奨', '孙': '孫', '学': '学',
    '宁': '寧', '宝': '宝', '将': '将', '尧': '尭', '强': '強',
    '彻': '徹', '德': '徳', '显': '顕', '晓': '暁', '晖': '暉',
    '权': '権', '杨': '楊', '杰': '傑', '极': '極', '构': '構',
    '枫': '楓', '查': '査', '桧': '桧', '梁': '梁', '梦': '夢',
    '检': '検', '榆': '楡', '榉': '欅', '赖': '頼', '涉': '渉',
    '润': '潤', '涩': '渋', '渊': '淵', '满': '満', '灵': '霊',
    '灿': '燦', '炼': '錬', '焕': '煥', '熏': '薫', '爱': '愛',
    '尔': '爾', '犹': '猶', '狮': '獅', '荧': '蛍', '荫': '蔭',
    '药': '薬', '庄': '荘', '莓': '苺', '苍': '蒼', '蓝': '藍',
    '藏': '蔵', '艺': '芸', '薮': '藪', '薰': '薫', '见': '見',
    '规': '規', '觉': '覚', '亲': '親', '观': '観', '诚': '誠',
    '详': '詳', '谦': '謙', '谨': '謹', '贞': '貞', '贤': '賢',
    '质': '質', '贯': '貫', '贵': '貴', '贺': '賀', '赞': '賛',
    '辉': '輝', '选': '選', '连': '連', '进': '進', '逸': '逸',
    '迟': '遅', '辽': '遼', '释': '釈', '钦': '欽', '钱': '銭',
    '铁': '鉄', '铃': '鈴', '铭': '銘', '锐': '鋭', '银': '銀',
    '锦': '錦', '锻': '鍛', '兰': '蘭', '镰': '鎌', '长': '長',
    '门': '門', '闻': '聞', '阳': '陽', '阴': '陰', '陆': '陸',
    '难': '難', '霸': '覇', '韩': '韓', '顺': '順', '须': '須',
    '顾': '顧', '颖': '穎', '颜': '顔', '飒': '颯', '飞': '飛',
    '马': '馬', '驰': '馳', '驹': '駒', '骏': '駿', '鹤': '鶴',
    '鹫': '鷲', '鹭': '鷺', '鹰': '鷹', '黑': '黒'
};

function convertToJapaneseKanji(text) {
    if (!text) return "";
    return text.split('').map(char => CN_JP_MAP[char] || char).join('');
}

// 缓存配置
const URL_CACHE_TTL = 60 * 60 * 24 * 365;   // URL 缓存有效期：1年
const PLAYER_INFO_CACHE_TTL = 60 * 60 * 24 * 30; // playerInfo 缓存有效期：30天
const DIRECT_FETCH_TIMEOUT_MS = 3000; // 直连超时：3秒（超时则 fallback ScraperAPI）

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const params = url.searchParams;
        const name = params.get("name");

        const corsHeaders = {
            "content-type": "application/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
        };

        if (!name) {
            return new Response(JSON.stringify({ error: "请提供 name 参数" }), { status: 400, headers: corsHeaders });
        }

        // KV 缓存键
        const urlCacheKey = `url:${name}`;
        const kv = env.PLAYER_CACHE;

        let finalPlayerUrl = null;

        // ----------------------------------------------------
        // 1. 尝试从 KV 缓存获取 finalPlayerUrl
        // ----------------------------------------------------
        if (kv) {
            const cachedUrl = await kv.get(urlCacheKey);
            if (cachedUrl && cachedUrl.startsWith('http')) {
                finalPlayerUrl = cachedUrl;
                console.log(`[KV Cache] 命中 URL 缓存: ${finalPlayerUrl}`);
            }
        }

        // ----------------------------------------------------
        // 2. 缓存未命中，执行 Yahoo Japan 搜索
        // ----------------------------------------------------
        if (!finalPlayerUrl) {
            console.log(`[Cache] 未命中，执行 Yahoo Japan 搜索: ${name}`);
            const searchName = convertToJapaneseKanji(name);
            console.log(`[Search] ${name} -> ${searchName}`);

            try {
                const query = `site:kyureki.com ${searchName}`;
                const yahooUrl = `https://search.yahoo.co.jp/search?p=${encodeURIComponent(query)}`;

                // 🚀 方案2: 通过 ScraperAPI 代理，添加 render=false 禁用 JS 渲染加速
                const scraperParams = new URLSearchParams({
                    api_key: env.SCRAPER_API_KEY,
                    url: yahooUrl,
                    country_code: "jp",
                    render: "false",
                });
                const scraperUrl = `http://api.scraperapi.com?${scraperParams.toString()}`;
                console.log(`[Search] Yahoo Japan URL (via ScraperAPI): ${yahooUrl}`);

                const searchRes = await fetch(scraperUrl, {
                    method: "GET",
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
                    }
                });

                if (!searchRes.ok) {
                    const errText = await searchRes.text();
                    console.error("Yahoo Japan Search Error:", errText);
                    return new Response(JSON.stringify({ error: "Search Service Error", details: "ScraperAPI 请求失败或额度耗尽" }), { status: 500, headers: corsHeaders });
                }

                const rawHtml = await searchRes.text();
                const htmlContent = rawHtml.replace(/(%[0-9A-Fa-f]{2})+/g, (match) => {
                    try { return decodeURIComponent(match); } catch (_) { return match; }
                });

                const match = htmlContent.match(/kyureki\.com\/[a-z]+\/(?:p)?(\d+)\/?/);
                if (match && match[1]) {
                    const playerId = match[1];
                    finalPlayerUrl = `https://www.kyureki.com/player/${playerId}/`;
                    console.log(`[ID Extraction] Found ID ${playerId} -> ${finalPlayerUrl}`);
                }

                // 🚀 方案3: 将 URL 写入 KV 持久缓存
                if (finalPlayerUrl && kv) {
                    ctx.waitUntil(kv.put(urlCacheKey, finalPlayerUrl, { expirationTtl: URL_CACHE_TTL }));
                    console.log(`[KV Cache] URL 已写入 KV: ${finalPlayerUrl}`);
                }

            } catch (e) {
                return new Response(JSON.stringify({ error: "Worker Error", details: e.message }), { status: 500, headers: corsHeaders });
            }
        }

        // ----------------------------------------------------
        // 3. 如果最终没有 URL，返回 404
        // ----------------------------------------------------
        if (!finalPlayerUrl) {
            return new Response(JSON.stringify({
                error: "未找到该球员",
                source: "Yahoo Japan",
                details: "Yahoo Japan 搜索中未找到匹配结果"
            }), { status: 404, headers: corsHeaders });
        }

        // ============================================================
        // STEP 2: 检查 playerInfo 缓存，或爬取并提取球员信息
        // ============================================================
        const playerInfoCacheKey = `playerInfo:${finalPlayerUrl}`;

        // 🚀 方案3: 从 KV 获取 playerInfo 缓存
        if (kv) {
            const cachedPlayerInfo = await kv.get(playerInfoCacheKey, "json");
            if (cachedPlayerInfo) {
                console.log(`[KV Cache] 命中 playerInfo 缓存: ${finalPlayerUrl}`);
                return new Response(JSON.stringify(cachedPlayerInfo), { headers: corsHeaders });
            }
        }

        try {
            console.log(`[Step 2] playerInfo 缓存未命中，开始爬取: ${finalPlayerUrl}`);

            // 🚀 方案1+2: 先直连，失败再 fallback ScraperAPI (render=false)
            const htmlContent = await fetchPlayerHtml(finalPlayerUrl, env.SCRAPER_API_KEY);

            if (!htmlContent || htmlContent.length < 100) {
                return new Response(JSON.stringify({ error: "Failed to scrape HTML content" }), { status: 500, headers: corsHeaders });
            }

            console.log(`[Step 2] Scraping success. HTML Length: ${htmlContent.length}`);

            const playerInfo = extractPlayerInfo(htmlContent);

            // 🚀 方案3: 将 playerInfo 写入 KV 持久缓存
            if (kv) {
                ctx.waitUntil(kv.put(playerInfoCacheKey, JSON.stringify(playerInfo), { expirationTtl: PLAYER_INFO_CACHE_TTL }));
                console.log(`[KV Cache] playerInfo 已写入 KV: ${finalPlayerUrl}`);
            }

            return new Response(JSON.stringify(playerInfo), { headers: corsHeaders });

        } catch (error) {
            return new Response(JSON.stringify({ error: "提取失败", details: error.message }), { status: 500, headers: corsHeaders });
        }
    },
};

// ============================================================
// 第一步：提取包含 Vue 数据的 <script> 片段
// ============================================================
function extractVueScript(html) {
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
        const scriptContent = match[1];
        // 找到包含 new Vue 且包含 datas: 的脚本
        if (scriptContent.includes('new Vue') && scriptContent.includes('datas:')) {
            console.log(`[Extract] Found Vue script, length: ${scriptContent.length}`);
            return scriptContent;
        }
    }
    return null;
}

// ============================================================
// 第二步：状态机提取 datas 对象（核心算法）
// ============================================================
function extractDatasObject(scriptContent) {
    const datasIndex = scriptContent.indexOf('datas:');
    if (datasIndex === -1) {
        console.log('[Extract] datas: not found');
        return null;
    }

    // 从 datas: 开始找第一个 {
    let startIndex = scriptContent.indexOf('{', datasIndex);
    if (startIndex === -1) {
        console.log('[Extract] Opening brace not found after datas:');
        return null;
    }

    let depth = 0;
    let inString = false;
    let stringChar = null;
    let i = startIndex;

    while (i < scriptContent.length) {
        const char = scriptContent[i];
        const prevChar = i > 0 ? scriptContent[i - 1] : '';

        // 处理转义字符：如果前一个是反斜杠，跳过当前字符
        if (prevChar === '\\' && inString) {
            i++;
            continue;
        }

        // 处理字符串状态切换
        if ((char === '"' || char === "'") && !inString) {
            inString = true;
            stringChar = char;
        } else if (char === stringChar && inString) {
            inString = false;
            stringChar = null;
        }

        // 只有在非字符串模式下才计算大括号层级
        if (!inString) {
            if (char === '{') depth++;
            if (char === '}') depth--;

            // 当层级归零时，完成提取
            if (depth === 0) {
                const extracted = scriptContent.substring(startIndex, i + 1);
                console.log(`[Extract] Extracted datas object, length: ${extracted.length}`);
                return extracted;
            }
        }

        i++;
    }

    console.log('[Extract] Failed to find matching closing brace');
    return null;
}

// ============================================================
// 第三步：解析数据并映射到输出结构
// ============================================================
function extractPlayerInfo(html) {
    // Step 1: 提取 Vue 脚本
    const vueScript = extractVueScript(html);
    if (!vueScript) {
        throw new Error('未找到 Vue 脚本');
    }

    // Step 2: 提取 datas 对象
    const datasString = extractDatasObject(vueScript);
    if (!datasString) {
        throw new Error('未找到 datas 对象');
    }

    // Step 3: 将 JS 对象字面量转换为 JSON 并解析
    let data;
    try {
        const jsonString = convertJsObjectToJson(datasString);
        data = JSON.parse(jsonString);
        console.log(`[Extract] Successfully parsed datas object`);
    } catch (e) {
        throw new Error(`解析 datas 对象失败: ${e.message}`);
    }

    // Step 4: 映射到输出结构
    return mapToPlayerInfo(data);
}

// ============================================================
// 将 JS 对象字面量转换为有效的 JSON
// ============================================================
function convertJsObjectToJson(jsString) {
    let result = jsString;

    // 1. 移除 JS 注释
    result = result.replace(/\/\/.*$/gm, ''); // 单行注释
    result = result.replace(/\/\*[\s\S]*?\*\//g, ''); // 多行注释

    // 2. 处理未加引号的键名: key: -> "key":
    // 匹配模式：行首或逗号/大括号后的空白，然后是标识符，然后是冒号
    result = result.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

    // 3. 将单引号字符串转换为双引号
    result = convertSingleToDoubleQuotes(result);

    // 4. 移除尾部逗号 (在 } 或 ] 之前的逗号)
    result = result.replace(/,(\s*[}\]])/g, '$1');

    // 5. 处理 undefined 和 null
    result = result.replace(/:\s*undefined\b/g, ': null');

    return result;
}

// ============================================================
// 将单引号字符串转换为双引号（状态机实现）
// ============================================================
function convertSingleToDoubleQuotes(str) {
    let result = '';
    let i = 0;
    
    while (i < str.length) {
        const char = str[i];
        
        // 如果遇到双引号字符串，原样保留
        if (char === '"') {
            result += char;
            i++;
            // 跳过整个双引号字符串
            while (i < str.length) {
                if (str[i] === '\\' && i + 1 < str.length) {
                    result += str[i] + str[i + 1];
                    i += 2;
                } else if (str[i] === '"') {
                    result += str[i];
                    i++;
                    break;
                } else {
                    result += str[i];
                    i++;
                }
            }
        }
        // 如果遇到单引号字符串，转换为双引号
        else if (char === "'") {
            result += '"'; // 开始双引号
            i++;
            // 处理字符串内容
            while (i < str.length) {
                if (str[i] === '\\' && i + 1 < str.length) {
                    // 处理转义
                    if (str[i + 1] === "'") {
                        // \' 转换为 '（在双引号字符串中不需要转义单引号）
                        result += "'";
                        i += 2;
                    } else if (str[i + 1] === '"') {
                        // 在单引号字符串中的 \" 需要保留转义
                        result += '\\"';
                        i += 2;
                    } else {
                        result += str[i] + str[i + 1];
                        i += 2;
                    }
                } else if (str[i] === '"') {
                    // 单引号字符串内的双引号需要转义
                    result += '\\"';
                    i++;
                } else if (str[i] === "'") {
                    // 结束单引号字符串
                    result += '"'; // 结束双引号
                    i++;
                    break;
                } else {
                    result += str[i];
                    i++;
                }
            }
        }
        else {
            result += char;
            i++;
        }
    }
    
    return result;
}

// ============================================================
// 映射函数：将 kyureki 数据映射到输出格式
// ============================================================
function mapToPlayerInfo(data) {
    // 基本信息提取
    const name = data.name || '';
    const team = data.kyudan || ''; // 当前所属球队
    const generation = data.generation || ''; // 出生世代
    const throwHand = data.k_nage || ''; // 投
    const batHand = data.k_uchi || ''; // 打
    const throwBat = throwHand && batHand ? `${throwHand}投${batHand}打` : '';
    const height = data.height ? `${data.height}cm` : '';
    const weight = data.weight ? `${data.weight}kg` : '';
    const position = data.posit || ''; // 位置
    const fastball = data.kyusoku || ''; // 最速球速
    const runSpeed = data.run ? `${data.run}秒` : ''; // 一垒到达速度
    const homerun = data.homerun || ''; // 全垒打

    // 棒球经历提取
    const kyurekiList = data.kyureki_list || [];
    let elementary = '';
    let middleSchool = '';
    let highSchool = '';
    let university = '';
    let professional = '';
    let representativeTeams = [];

    // 遍历 kyureki_list 提取各阶段球队
    if (Array.isArray(kyurekiList)) {
        for (const item of kyurekiList) {
            const category = item.category || '';
            const teamName = item.team || '';
            
            if (category === '小学') {
                elementary = elementary ? `${elementary}, ${teamName}` : teamName;
            } else if (category === '中学') {
                middleSchool = middleSchool ? `${middleSchool}, ${teamName}` : teamName;
            } else if (category === '高校') {
                highSchool = highSchool ? `${highSchool}, ${teamName}` : teamName;
            } else if (category === '大学') {
                university = university ? `${university}, ${teamName}` : teamName;
            } else if (category === '社会人' || category === 'プロ' || category === 'NPB') {
                professional = professional ? `${professional}, ${teamName}` : teamName;
            } else if (category === '日本代表' || category.includes('代表')) {
                representativeTeams.push(teamName);
            }
        }
    }

    // 提取荣誉/特点
    let honors = [];
    
    // 从 award 数组提取荣誉
    if (data.award && Array.isArray(data.award)) {
        for (const item of data.award) {
            if (item.award_name || item.name) {
                honors.push(item.award_name || item.name);
            }
        }
    }
    
    // 从 feature 数组提取特点
    if (data.feature && Array.isArray(data.feature)) {
        for (const item of data.feature) {
            if (item.feature_name) {
                honors.push(item.feature_name);
            }
        }
    }

    // 合并代表队经历
    if (representativeTeams.length > 0) {
        honors = [...representativeTeams, ...honors];
    }

    // 总结 - 使用 gpt_text
    const summary = data.gpt_text || '';

    return {
        "姓名": name,
        "数据源确认": name ? "是" : "否",
        "基本资料": {
            "所属": team,
            "出生世代": generation,
            "投打": throwBat,
            "身高": height,
            "体重": weight,
            "位置": position,
            "最速": fastball,
            "一垒到达速度": runSpeed,
            "全垒打": homerun
        },
        "棒球经历": {
            "小学": elementary,
            "中学": middleSchool,
            "高中": highSchool,
            "大学": university,
            "社会人/职业": professional,
            "代表队或主要荣誉": honors.length > 0 ? honors : ""
        },
        "总结": summary
    };
}

// ============================================================
// 🚀 方案1: 直连优先 + ScraperAPI Fallback 抓取函数
// ============================================================
async function fetchPlayerHtml(targetUrl, apiKey) {
    // --- 第一步：尝试直接请求（Cloudflare Worker 全球边缘节点，可能直连成功） ---
    try {
        console.log(`[Fetch] 尝试直连: ${targetUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DIRECT_FETCH_TIMEOUT_MS);

        const directResponse = await fetch(targetUrl, {
            method: "GET",
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
            }
        });
        clearTimeout(timeoutId);

        if (directResponse.ok) {
            const text = await directResponse.text();
            // 验证返回的是有效的球员页面（包含 Vue 数据）
            if (text.includes('new Vue') && text.includes('datas:')) {
                console.log(`[Fetch] ✅ 直连成功! HTML Length: ${text.length}`);
                return text;
            }
            console.log(`[Fetch] 直连返回内容无效（无 Vue 数据），回退 ScraperAPI`);
        } else {
            console.log(`[Fetch] 直连失败 (HTTP ${directResponse.status})，回退 ScraperAPI`);
        }
    } catch (e) {
        console.log(`[Fetch] 直连异常 (${e.message})，回退 ScraperAPI`);
    }

    // --- 第二步：Fallback 到 ScraperAPI ---
    console.log(`[Fetch] 使用 ScraperAPI 抓取: ${targetUrl}`);
    const scraperApiEndpoint = "http://api.scraperapi.com";

    // 🚀 方案2: 添加 render=false 禁用 JS 渲染，大幅加速
    const params = new URLSearchParams({
        api_key: apiKey,
        url: targetUrl,
        country_code: "jp",
        render: "false",
    });

    const fullUrl = `${scraperApiEndpoint}?${params.toString()}`;

    const response = await fetch(fullUrl, {
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ScraperAPI Error: ${response.status} - ${errText}`);
    }

    return await response.text();
}