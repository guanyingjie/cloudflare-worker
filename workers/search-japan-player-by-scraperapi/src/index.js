/**
 * Cloudflare Worker: Kyureki Finder (Google API Edition) - 提取球员信息版本
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
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365; // 缓存有效期：1年

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

        const cacheKey = new Request(url.toString(), request);
        const cache = caches.default;

        let finalPlayerUrl = null;
        let rawFoundUrl = null;
        let isFromCache = false;

        // ----------------------------------------------------
        // 1. 尝试从缓存中获取 finalPlayerUrl
        // ----------------------------------------------------
        let cachedResponse = await cache.match(cacheKey);

        if (cachedResponse) {
            const cachedUrl = await cachedResponse.text();
            if (cachedUrl && cachedUrl.startsWith('http')) {
                finalPlayerUrl = cachedUrl;
                isFromCache = true;
                console.log(`[Cache] 命中缓存，获取到 URL: ${finalPlayerUrl}`);
            }
        }

        // ----------------------------------------------------
        // 2. 如果缓存没命中（或者无效），执行 Google API 查找
        // ----------------------------------------------------
        if (!finalPlayerUrl) {
            console.log(`[Cache] 未命中，执行 Google API 搜索: ${name}`);
            const searchName = convertToJapaneseKanji(name);
            console.log(`[Search] ${name} -> ${searchName}`);

            try {
                const googleApiUrl = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${env.GOOGLE_CX_ID}&q=${encodeURIComponent(searchName)}&num=1`;
                console.log(`Google API URL: ${googleApiUrl}`);
                const googleRes = await fetch(googleApiUrl);

                if (!googleRes.ok) {
                    const errText = await googleRes.text();
                    console.error("Google API Error:", errText);
                    return new Response(JSON.stringify({ error: "Search Service Error", details: "API Key配置错误或额度耗尽" }), { status: 500, headers: corsHeaders });
                }

                const data = await googleRes.json();

                if (data.items && data.items.length > 0) {
                    for (const item of data.items) {
                        const rawUrl = item.link;
                        // 正则匹配 ID
                        const match = rawUrl.match(/kyureki\.com\/[a-z]+\/(?:p)?(\d+)\/?/);
                        if (match && match[1]) {
                            const playerId = match[1];
                            finalPlayerUrl = `https://www.kyureki.com/player/${playerId}/`;
                            rawFoundUrl = rawUrl;
                            console.log(`[ID Extraction] Found ID ${playerId} in ${rawUrl} -> ${finalPlayerUrl}`);
                            break;
                        }
                    }
                }

                // ============================================
                // 3. 将找到的 finalPlayerUrl 写入缓存
                // ============================================
                if (finalPlayerUrl) {
                    const urlResponse = new Response(finalPlayerUrl, {
                        headers: {
                            "Content-Type": "text/plain",
                            "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
                        }
                    });
                    ctx.waitUntil(cache.put(cacheKey, urlResponse));
                    console.log(`[Cache] 新 URL 已写入缓存: ${finalPlayerUrl}`);
                }

            } catch (e) {
                return new Response(JSON.stringify({ error: "Worker Error", details: e.message }), { status: 500, headers: corsHeaders });
            }
        }

        // ----------------------------------------------------
        // 4. 如果最终还是没有 URL，返回 404
        // ----------------------------------------------------
        if (!finalPlayerUrl) {
            return new Response(JSON.stringify({
                error: "未找到该球员",
                source: "Google API",
                details: "Google 收录中未找到匹配结果"
            }), { status: 404, headers: corsHeaders });
        }

        // ============================================================
        // STEP 2: 调用爬虫脚本获取 HTML，提取球员信息
        // ============================================================
        try {
            console.log(`[Step 2] Start scraping: ${finalPlayerUrl}`);

            const htmlContent = await fetchPlayerHtml(finalPlayerUrl, env.SCRAPER_API_KEY);

            if (!htmlContent || htmlContent.length < 100) {
                return new Response(JSON.stringify({ error: "Failed to scrape HTML content" }), { status: 500, headers: corsHeaders });
            }

            console.log(`[Step 2] Scraping success. HTML Length: ${htmlContent.length}`);

            // 提取球员信息并翻译
            const playerInfo = await extractPlayerInfo(htmlContent);

            return new Response(JSON.stringify(playerInfo), {
                headers: corsHeaders
            });

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
async function extractPlayerInfo(html) {
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

    // Step 4: 映射到输出结构并翻译
    return await mapToPlayerInfo(data);
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
                        // \' 转换为 '（在双引号字符串中不需要转义
                        // 单引号）
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
// Google Apps Script 翻译 API
// ============================================================
const TRANSLATE_API_URL = "https://script.google.com/macros/s/AKfycbwJso2uCoUGvc7AYefSTx_ymeJBk4afqv-a8OcQhuDV5LX1CZXuO8e7sIqK8GhiA97eoA/exec";

async function translateWithGoogle(text) {
    if (!text || text.trim() === '') return '';
    
    try {
        const url = `${TRANSLATE_API_URL}?q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.log(`[Translate] Failed for: ${text.substring(0, 50)}...`);
            return text; // 翻译失败返回原文
        }
        const translated = await res.text();
        console.log(`[Translate] ${text.substring(0, 30)} -> ${translated.substring(0, 30)}`);
        return translated;
    } catch (e) {
        console.log(`[Translate] Error: ${e.message}`);
        return text; // 出错返回原文
    }
}

// 批量翻译数组
async function translateArray(arr) {
    if (!arr || arr.length === 0) return [];
    const results = await Promise.all(arr.map(item => translateWithGoogle(item)));
    return results;
}

// ============================================================
// 映射函数：将 kyureki 数据映射到输出格式（含翻译）
// ============================================================
async function mapToPlayerInfo(data) {
    // 基本信息提取（原始日文）
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

    // ============================================================
    // 并行翻译所有需要翻译的字段
    // ============================================================
    console.log('[Translate] Starting batch translation...');
    
    const [
        teamTranslated,
        positionTranslated,
        elementaryTranslated,
        middleSchoolTranslated,
        highSchoolTranslated,
        universityTranslated,
        professionalTranslated,
        summaryTranslated,
        honorsTranslated
    ] = await Promise.all([
        translateWithGoogle(team),
        translateWithGoogle(position),
        translateWithGoogle(elementary),
        translateWithGoogle(middleSchool),
        translateWithGoogle(highSchool),
        translateWithGoogle(university),
        translateWithGoogle(professional),
        translateWithGoogle(summary),
        translateArray(honors)
    ]);

    console.log('[Translate] Translation completed.');

    return {
        "姓名": name,
        "数据源确认": name ? "是" : "否",
        "基本资料": {
            "所属": teamTranslated,
            "出生世代": generation,
            "投打": throwBat,
            "身高": height,
            "体重": weight,
            "位置": positionTranslated,
            "最速": fastball,
            "一垒到达速度": runSpeed,
            "全垒打": homerun
        },
        "棒球经历": {
            "小学": elementaryTranslated,
            "中学": middleSchoolTranslated,
            "高中": highSchoolTranslated,
            "大学": universityTranslated,
            "社会人/职业": professionalTranslated,
            "代表队或主要荣誉": honorsTranslated.length > 0 ? honorsTranslated : ""
        },
        "总结": summaryTranslated
    };
}

// ============================================================
// ScraperAPI 抓取函数
// ============================================================
async function fetchPlayerHtml(targetUrl, apiKey) {
    const scraperApiEndpoint = "http://api.scraperapi.com";

    const params = new URLSearchParams({
        api_key: apiKey,
        url: targetUrl,
        country_code: "jp", // 强制日本 IP 绕过 Geo-blocking
    });

    const fullUrl = `${scraperApiEndpoint}?${params.toString()}`;

    const response = await fetch(fullUrl, {
        method: "GET",
        headers: {
            "User-Agent": "Cloudflare-Worker-Scraper/1.0"
        }
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ScraperAPI Error: ${response.status} - ${errText}`);
    }

    return await response.text();
}