import * as cheerio from 'cheerio';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const targetDateStr = url.searchParams.get('date'); // e.g. 2024-10-18

        if (!targetDateStr) {
            return new Response(JSON.stringify({ error: 'Missing date param. e.g. ?date=2024-10-18' }), {
                headers: { 'content-type': 'application/json' }
            });
        }

        // Yahoo 运动的赛程 URL 格式
        const yahooUrl = `https://tw.sports.yahoo.com/cpbl/scoreboard/?date=${targetDateStr}`;

        // --- 缓存逻辑 ---
        const cache = caches.default;
        const cacheKey = new Request(yahooUrl, { method: 'GET' });
        let response = await cache.match(cacheKey);

        if (!response) {
            console.log(`Fetching Yahoo CPBL: ${yahooUrl}`);
            response = await fetch(yahooUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (response.ok) {
                response = new Response(response.body, response);
                response.headers.append('Cache-Control', 's-maxage=600');
                ctx.waitUntil(cache.put(cacheKey, response.clone()));
            }
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const matches = [];

        // --- 解析 Yahoo 运动的 HTML 结构 ---
        // Yahoo 的赛程列表通常在一个特定的容器里，我们需要找到包含比赛信息的卡片
        // 注意：类名可能会变，建议用相对稳定的选择器

        // 查找所有的比赛卡片 (通常是 li 标签或者特定的 div)
        // 观察 Yahoo 结构，通常比赛卡片在 .GamesList 或者是 .Scoreboard 相关的 class 下
        // 下面是一个基于常见 Yahoo 结构的解析尝试：

        $('li.game-card').each((i, el) => {
            // 提取队伍
            // 结构通常是: .Team--away .name 和 .Team--home .name
            const awayTeam = $(el).find('[class*="Team--away"] [class*="name"]').text().trim();
            const homeTeam = $(el).find('[class*="Team--home"] [class*="name"]').text().trim();

            // 提取比分
            const awayScore = $(el).find('[class*="Team--away"] [class*="score"]').text().trim();
            const homeScore = $(el).find('[class*="Team--home"] [class*="score"]').text().trim();

            // 提取状态 (例如 "已结束", "17:05", "延赛")
            const statusText = $(el).find('[class*="status"]').text().trim();

            // 提取场地 (Yahoo 有时会在副标题显示场地，如果没有可忽略)
            const location = $(el).find('[class*="venue"]').text().trim() || "未知场地";

            // 只有当至少抓到了队伍名才算有效数据
            if (awayTeam && homeTeam) {

                let status = 'Scheduled';
                if (statusText.includes('結束') || statusText.includes('Final')) {
                    status = 'Final';
                } else if (statusText.includes('延賽')) {
                    status = 'Postponed';
                } else if (statusText.includes(':')) {
                    // 如果显示的是时间 (如 18:35)，说明是未开始
                    status = 'Scheduled';
                } else {
                    status = 'Live'; // 其他情况可能是在进行中
                }

                matches.push({
                    game_id: `yahoo-${i}`, // Yahoo 不一定直接暴露 ID，用索引暂代
                    status: status,
                    status_text: statusText, // 保留原始状态文本以备参考
                    location: location,
                    away: { team: awayTeam, score: awayScore || '0' },
                    home: { homeTeam, score: homeScore || '0' }
                });
            }
        });

        // 如果 Yahoo 结构大改导致抓不到 (fallback)
        if (matches.length === 0) {
            // 尝试另一种常见的 Yahoo 列表选择器
            $('[class*="Scoreboard"] [class*="GameItem"]').each((i, el) => {
                // 这里填入备用的解析逻辑，原理同上
            });
        }

        return new Response(JSON.stringify({
            query_date: targetDateStr,
            data_source: 'Yahoo Sports TW',
            count: matches.length,
            matches: matches
        }, null, 2), {
            headers: {
                'content-type': 'application/json;charset=UTF-8',
                'Access-Control-Allow-Origin': '*'
            },
        });
    },
};