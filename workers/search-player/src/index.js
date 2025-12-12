/**
 * Cloudflare Worker: Kyureki Finder (Google API Edition) - 增加缓存功能
 */

// 🔴 必须替换这里的内容 🔴
const GOOGLE_API_KEY = "AIzaSyB_ClNsdqcSQTykK7qVNyIccDWDIbC4bTs";
const GOOGLE_CX_ID = "e5d247b3ac13f4d63";

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
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365; // 缓存有效期：30天

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
        // 注意：这里我们缓存的是一个纯文本 Response，内容就是 finalPlayerUrl
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
                const googleApiUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX_ID}&q=${encodeURIComponent(searchName)}&num=1`;
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
                    // 构造一个只包含 URL 字符串的 Response 用于缓存
                    // Cloudflare Cache API 需要 Response 对象
                    const urlResponse = new Response(finalPlayerUrl, {
                        headers: {
                            "Content-Type": "text/plain",
                            // 必须设置 Cache-Control 才能被 cache.put 存储
                            "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
                        }
                    });

                    // 异步写入缓存
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

        // ----------------------------------------------------
        // 5. 统一执行 Archive Url 获取逻辑 (无论 URL 来源是缓存还是 Google)
        // ----------------------------------------------------
        console.log(`[Process] 准备获取 Archive URL，目标: ${finalPlayerUrl}`);

        let archiveUrl = null;
        let retryCount = 0;
        const maxRetries = 1;

        while (retryCount <= maxRetries && !archiveUrl) {
            try {
                if (retryCount > 0) {
                    console.log(`[Wayback Check] 重试第 ${retryCount} 次...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                const archiveApiUrl = `https://archive.org/wayback/available?url=${finalPlayerUrl}`;
                const archiveRes = await fetch(archiveApiUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                });

                const archiveData = await archiveRes.json();
                console.log(`[Wayback Check] API Raw Response: ${JSON.stringify(archiveData)}`);

                if (archiveData.archived_snapshots && archiveData.archived_snapshots.closest) {
                    archiveUrl = archiveData.archived_snapshots.closest.url;
                }
            } catch (e) {
                console.error(`[Wayback Check] 请求失败:`, e);
            }
            retryCount++;
        }

        if (!archiveUrl) {
            console.warn(`[Wayback Check] 经过 ${maxRetries + 1} 次尝试后仍未找到存档`);
        }

        // ----------------------------------------------------
        // 6. 返回最终 JSON 结果给用户 (这个 Response 不会被缓存)
        // ----------------------------------------------------
        const responseBody = JSON.stringify({
            name: name,
            source: isFromCache ? "Cloudflare Cache" : "Google API", // 标记数据来源
            url: archiveUrl,
            original_url: finalPlayerUrl,
            extracted_from: rawFoundUrl, // 如果是缓存命中，这个字段可能为空，除非你也把它缓存进去
            has_archive: !!archiveUrl
        });

        // 这里的 Cache-Control 只是给浏览器的建议，不影响 Worker 内部的缓存逻辑
        return new Response(responseBody, {
            headers: {
                ...corsHeaders,
                "Cache-Control": "public, max-age=600" // 客户端短缓存，防止 WayBack 瞬间变动
            },
        });
    },
};