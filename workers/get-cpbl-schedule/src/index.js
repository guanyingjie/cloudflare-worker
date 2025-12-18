export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // 1. 获取参数: 默认查当天，或者传入 ?date=2024-04-01
        // 注意：CPBL 接口要求日期格式为 "YYYY/MM/DD"
        const inputDate = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
        const targetDate = inputDate.replace(/-/g, '/'); // 将 2024-04-01 转为 2024/04/01

        // =================================================
        // 第一步：访问页面获取 CSRF Token 和 Cookie
        // =================================================
        const MAIN_PAGE_URL = 'https://cpbl.com.tw/schedule';
        const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

        try {
            const pageResponse = await fetch(MAIN_PAGE_URL, {
                headers: { 'User-Agent': USER_AGENT }
            });

            if (!pageResponse.ok) {
                throw new Error('CPBL Homepage unavailable');
            }

            // 提取 Cookie
            const setCookieHeader = pageResponse.headers.get('set-cookie');

            // 提取 Token
            const htmlText = await pageResponse.text();
            const tokenMatch = htmlText.match(/<input name="__RequestVerificationToken" type="hidden" value="([^"]+)"/);

            if (!tokenMatch || !setCookieHeader) {
                throw new Error('Failed to get security token');
            }

            const verificationToken = tokenMatch[1];

            // =================================================
            // 第二步：请求数据接口
            // =================================================
            const API_URL = 'https://cpbl.com.tw/schedule/getgamedatas';

            const bodyParams = new URLSearchParams();
            bodyParams.append('calendar', targetDate);
            bodyParams.append('location', '');
            bodyParams.append('kindCode', 'A'); // A: 一军例行赛

            const apiResponse = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'User-Agent': USER_AGENT,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Referer': MAIN_PAGE_URL,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Cookie': setCookieHeader,
                    'RequestVerificationToken': verificationToken
                },
                body: bodyParams
            });

            if (!apiResponse.ok) {
                throw new Error(`CPBL API Error: ${apiResponse.status}`);
            }

            const rawData = await apiResponse.json();

            // =================================================
            // 第三步：数据清洗 (清洗核心逻辑)
            // =================================================

            // 检查 rawData 是否为数组，CPBL 有时候查无数据会返回空数组或特殊结构
            if (!Array.isArray(rawData)) {
                return new Response(JSON.stringify({ message: "No games found or format changed", raw: rawData }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const cleanedSchedule = rawData.map(game => {
                // 判断比赛是否已经有比分
                // 逻辑：如果 HomeScore 或 AwayScore 是 null/空字符串，说明比赛未开始或未结束
                const hasScore = (game.HomeScore !== null && game.HomeScore !== "") &&
                    (game.AwayScore !== null && game.AwayScore !== "");

                return {
                    // 1. 比赛时间 (组合日期和时间)
                    dateTime: `${game.GameDate} ${game.GameTime}`, // e.g. "2024/04/03 18:35"
                    displayTime: game.GameTime, // e.g. "18:35"

                    // 2. 球队名称
                    home: game.HomeTeamName, // 主队
                    away: game.AwayTeamName, // 客队

                    // 3. 场地 (额外附赠，通常很有用)
                    place: game.Location,

                    // 4. 比分处理
                    // 如果有比分则返回数字，如果没有则返回 null，方便前端判断是用 "vs" 还是显示数字
                    score: hasScore ? {
                        home: parseInt(game.HomeScore),
                        away: parseInt(game.AwayScore)
                    } : null,

                    // 状态 (用于辅助前端判断，比如 '延赛' 等)
                    status: game.GameStatus // 通常 'F' 代表结束，但不完全准确，依赖 score 判断最直观
                };
            });

            // =================================================
            // 第四步：返回给小程序
            // =================================================
            return new Response(JSON.stringify(cleanedSchedule), {
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Access-Control-Allow-Origin': '*', // 允许小程序跨域
                    'Cache-Control': 'public, max-age=300' // 缓存 5 分钟
                }
            });

        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    },
};