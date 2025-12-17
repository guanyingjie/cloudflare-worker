import * as cheerio from 'cheerio';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const targetDateStr = url.searchParams.get('date'); // 格式: 2024-05-20

        // 1. 基础验证
        if (!targetDateStr) {
            return new Response(JSON.stringify({ error: 'Please provide a date param. e.g. ?date=2024-05-20' }), {
                headers: { 'content-type': 'application/json' },
            });
        }

        // 2. 解析日期 YYYY-MM-DD
        const [year, month, day] = targetDateStr.split('-');
        if (!year || !month || !day) {
            return new Response(JSON.stringify({ error: 'Invalid date format' }), { headers: { 'content-type': 'application/json' } });
        }

        // 3. 构造 CPBL 官网 URL (kindCode=A 代表一军)
        const cpblUrl = `https://www.cpbl.com.tw/schedule?year=${year}&month=${month}&kindCode=A`;

        // 4. 尝试读取缓存 (Cloudflare Cache API)
        // 我们把 CPBL 的整页 HTML 缓存 10 分钟，这样多人查询同一个月时不用重复爬取
        const cache = caches.default;
        const cacheKey = new Request(cpblUrl, { method: 'GET' }); // 以 CPBL URL 为缓存键
        let response = await cache.match(cacheKey);

        if (!response) {
            console.log(`Cache miss. Fetching from CPBL: ${cpblUrl}`);
            // 伪装 User-Agent，防止被简单的反爬虫拦截
            response = await fetch(cpblUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            // 如果请求成功，存入缓存 (设置 TTL 为 600秒 = 10分钟)
            if (response.ok) {
                response = new Response(response.body, response);
                response.headers.append('Cache-Control', 's-maxage=600');
                ctx.waitUntil(cache.put(cacheKey, response.clone()));
            }
        } else {
            console.log('Cache hit.');
        }

        const html = await response.text();

        // 5. 使用 Cheerio 解析 HTML
        const $ = cheerio.load(html);
        const matches = [];

        // 注意：CSS 选择器是基于 CPBL 官网 2024 年的结构。
        // 如果官网改版，这里是唯一需要修改的地方。
        // 逻辑：找到所有的 .game_content (每一场比赛的卡片)

        $('.game_content').each((i, el) => {
            // 提取该场比赛的日期信息
            // 结构通常是: <div class="date_title"><span>5月20日 (六)</span>...</div>
            // 但是在列表中，date_title 通常位于 game_content 的上方或内部。
            // CPBL 的 HTML 结构比较复杂，通常是 日期头 -> 多个比赛卡片。
            // 为了稳健，我们通过查找该卡片所属的日期容器。

            // 尝试方案：CPBL 列表可能是 .schedule_main -> .one_block (每一天) -> .game_content
            const dateBlock = $(el).closest('.one_block');
            const dateText = dateBlock.find('.date_title').text().trim(); // e.g. "5月20日 (六)"

            // 简单匹配：检查 dateText 是否包含我们查询的 "M月D日"
            // 比如 target: 05-20. 检查 "5月20日"
            const targetMonthDay = `${parseInt(month)}月${parseInt(day)}日`;

            if (dateText.includes(targetMonthDay)) {
                // 找到了当天的比赛！开始提取详情

                const gameId = $(el).find('.game_number').text().trim();
                const location = $(el).find('.place').text().trim();

                // 提取客队
                const awayTeam = $(el).find('.team_away .name').text().trim();
                const awayScore = $(el).find('.team_away .score').text().trim();

                // 提取主队
                const homeTeam = $(el).find('.team_home .name').text().trim();
                const homeScore = $(el).find('.team_home .score').text().trim();

                // 判断状态
                let status = 'Scheduled';
                if (awayScore && homeScore) {
                    // 如果有比分，且不是延赛，通常意味着正在进行或已结束
                    // 简单的判断逻辑：
                    if ($(el).find('.game_process').text().includes('FINAL') ||
                        $(el).find('.game_process').text().includes('结束')) {
                        status = 'Final';
                    } else {
                        status = 'Live'; // 粗略判断
                    }
                }

                // 处理延赛情况 (CPBL 常见的 "延赛")
                if ($(el).text().includes('延赛')) {
                    status = 'Postponed';
                }

                matches.push({
                    game_id: gameId,
                    status: status,
                    location: location,
                    away: { team: awayTeam, score: awayScore },
                    home: { team: homeTeam, score: homeScore },
                    raw_date: dateText
                });
            }
        });

        // 6. 返回 JSON
        const result = {
            query_date: targetDateStr,
            data_source: 'CPBL Official',
            matches: matches
        };

        return new Response(JSON.stringify(result, null, 2), {
            headers: {
                'content-type': 'application/json;charset=UTF-8',
                'Access-Control-Allow-Origin': '*' // 允许你的 App 跨域调用
            },
        });
    },
};