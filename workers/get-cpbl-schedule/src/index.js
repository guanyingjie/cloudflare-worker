export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // 1. 获取参数 (例如 ?date=2024-04-01)
        // 如果没传，默认用今天
        const inputDate = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

        // 解析日期：将 "2024-04-01" 拆分为 year="2024", month="04"
        const [year, month] = inputDate.split('-');

        // =================================================
        // 核心修改：改用 GET 请求，直接带上查询参数
        // =================================================
        // GameType=01 代表一军例行赛
        // IsLookUp=1 是官网查询时必然带的参数
        const CPBL_API_URL = `https://cpbl.com.tw/schedule/getgamedatas?GameYear=${year}&GameMonth=${month}&GameType=01&IsLookUp=1`;

        const headers = {
            // 必须伪装 Referer，告诉服务器我是从赛程页点过来的
            'Referer': 'https://cpbl.com.tw/schedule',
            // 必须伪装 User-Agent，防止被当成爬虫
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            // 告诉服务器这是一个 AJAX 请求
            'X-Requested-With': 'XMLHttpRequest',
            // 接受 JSON
            'Accept': 'application/json, text/javascript, */*; q=0.01'
        };

        try {
            const response = await fetch(CPBL_API_URL, {
                method: 'GET', // 显式使用 GET
                headers: headers
            });

            if (!response.ok) {
                // 如果这里还报错，我们会把具体的 HTTP 状态码打印出来方便调试
                // 比如 403 就是被封了，500 是对方服务器炸了
                throw new Error(`CPBL API Blocked or Error: ${response.status} ${response.statusText}`);
            }

            const rawData = await response.json();

            // =================================================
            // 数据清洗逻辑
            // =================================================

            // 容错处理：有时候官网查不到会返回空，或者结构不对
            if (!Array.isArray(rawData)) {
                return new Response(JSON.stringify([]), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const cleanedSchedule = rawData.map(game => {
                // 判断是否已有比分
                const hasScore = (game.HomeScore !== null && game.HomeScore !== "") &&
                    (game.AwayScore !== null && game.AwayScore !== "");

                return {
                    // 球队
                    home: game.HomeTeamName,
                    away: game.AwayTeamName,

                    // 时间
                    date: game.GameDate, // "2024/04/03"
                    time: game.GameTime, // "18:35"

                    // 场地
                    place: game.Location,

                    // 比分 (只在有分时返回数字)
                    score: hasScore ? {
                        home: parseInt(game.HomeScore),
                        away: parseInt(game.AwayScore)
                    } : null,

                    // 比赛状态
                    status: game.GameStatus
                };
            });

            // =================================================
            // 返回结果
            // =================================================
            return new Response(JSON.stringify(cleanedSchedule), {
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Access-Control-Allow-Origin': '*',
                    // 缓存 10 分钟，减轻官网压力
                    'Cache-Control': 'public, max-age=600'
                }
            });

        } catch (e) {
            // 打印详细错误，方便我们在 Worker 后台 Log 里看
            return new Response(JSON.stringify({
                error: e.message,
                hint: "Trying to access CPBL directly via GET failed."
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    },
};