export default {
    async fetch(request, env, ctx) {
        // 1. 解析请求 URL，支持通过 ?date=YYYYMMDD 传入自定义日期
        const url = new URL(request.url);
        let gameDate = url.searchParams.get('date');

        // 如果没有传入日期，则默认获取当前服务器时间对应的日本时区日期
        if (!gameDate) {
            const now = new Date();
            // 转换为东九区（日本）时间
            const jstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
            const year = jstDate.getFullYear();
            const month = String(jstDate.getMonth() + 1).padStart(2, '0');
            const day = String(jstDate.getDate()).padStart(2, '0');
            gameDate = `${year}${month}${day}`;
        }

        // 2. 构建一球速报的真实请求地址
        // _=${Date.now()} 用于防止缓存
        const targetUrl = `https://baseball.omyutech.com/json/searchRecCupList.action?gameDate=${gameDate}&searchNum=999&userId=&navMenuItem=H&area=&_=${Date.now()}`;

        // 3. 构造伪装请求头 (省略了 Cookie 以防止过期导致失效，大部分情况只校验 UA 和 Referer)
        const headers = new Headers({
            'accept': 'application/json, text/javascript, */*; q=0.01',
            'accept-language': 'zh-CN,zh;q=0.9,ja-CN;q=0.8,ja;q=0.7',
            'referer': 'https://baseball.omyutech.com/HomePageMain.action?catalog=H&subCatalog=G',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            'x-requested-with': 'XMLHttpRequest'
        });

        try {
            // 4. 发起请求
            const response = await fetch(targetUrl, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`Target API responded with status: ${response.status}`);
            }

            const rawData = await response.json();

            // 5. 清洗数据：提取 recGameList，丢弃广告字段
            const rawGames = rawData.recGameList || [];

            const cleanGames = rawGames.map(game => ({
                gameId: game.gameID,                  // 比赛ID
                cupName: game.cupName,                // 赛事名称 (如: 第98回選抜高等学校野球大会)
                phase: game.phaseName,                // 轮次 (如: １回戦)
                time: game.scheduledTime,             // 预定时间 (如: 10:30)
                stadium: game.stadiumName,            // 场馆 (如: 阪神甲子園球場)
                awayTeam: game.awayTeamName,          // 客队/先攻 (如: 帝京)
                awayTeamRegion: game.vTeamRegion,
                awayScore: game.vTeamScore,           // 客队得分
                homeTeam: game.homeTeamName,          // 主队/后攻 (如: 沖縄尚学)
                homeTeamRegion: game.hTeamRegion,
                homeScore: game.hTeamScore,           // 主队得分
                status: game.gameStatusName,          // 比赛状态 (如: 試合開始前)
            }));

            // 6. 返回处理好的 JSON 数据，并配置允许跨域(CORS)
            return new Response(JSON.stringify({
                code: 200,
                date: gameDate,
                total: cleanGames.length,
                games: cleanGames
            }), {
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Access-Control-Allow-Origin': '*', // 允许所有前端跨域调用
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                }
            });

        } catch (error) {
            return new Response(JSON.stringify({
                code: 500,
                error: error.message
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    }
};