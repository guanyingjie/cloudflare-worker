// 导入同级目录下的 JSON 数据
// Wrangler 会自动将其打包到 Worker 中
import gamesData from './cleaned_result.json';

export default {
  async fetch(request, env, ctx) {
    // 设置 CORS 头部，允许前端跨域调用
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Content-Type': 'application/json; charset=utf-8',
    };

    // 处理预检请求 (OPTIONS)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      // 获取查询参数 'date'
      // 例如: ?date=2025 或 ?date=2025-06 或 ?date=2025-06-28
      let queryDate = url.searchParams.get('date');

      let filteredGames = gamesData;

      if (queryDate) {
        // 数据清洗：将可能的斜杠 / 替换为短横线 -，保证格式统一
        // 比如用户输入 2025/06 也能识别
        queryDate = queryDate.replace(/\//g, '-');

        // 核心过滤逻辑：使用 startsWith
        // 因为 GameDate 格式固定为 "YYYY-MM-DD...",
        // 所以 "2025"、"2025-06"、"2025-06-28" 都可以通过前缀匹配
        filteredGames = gamesData.filter(game => {
          return game.GameDate && game.GameDate.startsWith(queryDate);
        });
      }

      // 字段映射：只返回用户需要的特定字段
      const responseData = filteredGames.map(game => ({
        KindCode: game.KindCode,
        GameDate: game.GameDate,
        GameDateTimeS: game.GameDateTimeS,
        HomeTeamName: game.HomeTeamName,
        HomeScore: game.HomeScore,
        VisitingTeamName: game.VisitingTeamName,
        VisitingScore: game.VisitingScore
      }));

      // 返回结果
      return new Response(JSON.stringify({
        query: queryDate || "all",
        count: responseData.length,
        games: responseData
      }), {
        headers: corsHeaders
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  },
};