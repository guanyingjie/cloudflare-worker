/**
 * MLB Player Profile Worker (Enhanced Version)
 * 功能：查询球员全方位信息 (基本信息 + 实时数据 + 生涯数据 + 奖项 + 选秀)
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const params = url.searchParams;
        const playerId = params.get("id");
        const playerName = params.get("name");

        const corsHeaders = {
            "Content-Type": "application/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
        };

        if (!playerId && !playerName) {
            return new Response(JSON.stringify({ error: "Missing 'id' or 'name'" }), { status: 400, headers: corsHeaders });
        }

        try {
            let targetId = playerId;

            // 1. 如果没有 ID，先搜索
            if (!targetId && playerName) {
                const searchUrl = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(playerName)}`;
                const searchRes = await fetch(searchUrl);
                const searchData = await searchRes.json();
                if (!searchData.people || searchData.people.length === 0) {
                    return new Response(JSON.stringify({ error: "Player not found" }), { status: 404, headers: corsHeaders });
                }
                targetId = searchData.people[0].id;
            }

            // 2. 🔥 核心升级：超级 Hydration 参数 🔥
            // 获取：当前球队、打击/投球/守备数据、本赛季/生涯/逐年数据、奖项、选秀
            const hydrationParams = [
                "currentTeam",
                "team",
                "awards",
                "draft",
                "stats(group=[hitting,pitching,fielding],type=[season])" // 这里我去掉了yearByYear以减少包体，如需图表可加上
            ].join(",");

            const detailUrl = `https://statsapi.mlb.com/api/v1/people/${targetId}?hydrate=${hydrationParams}`;

            const detailRes = await fetch(detailUrl);
            const detailData = await detailRes.json();

            if (!detailData.people || detailData.people.length === 0) {
                return new Response(JSON.stringify({ error: "Details not found" }), { status: 404, headers: corsHeaders });
            }

            const player = detailData.people[0];

            // 3. 数据清洗与提取
            const cleanData = {
                // --- 基本信息 ---
                basic: {
                    id: player.id,
                    name: player.fullName,
                    nickname: player.nickName || "",
                    number: player.primaryNumber || "--",
                    country: player.birthCountry,
                    age: player.currentAge,
                    birthDate: player.birthDate,
                    height: player.height,
                    weight: player.weight + " lbs",
                    position: player.primaryPosition?.name || "Unknown",
                    positionCode: player.primaryPosition?.abbreviation || "",
                    throws: player.pitchHand?.description || "R",
                    bats: player.batSide?.description || "R",
                    headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_426,q_auto:best/v1/people/${player.id}/headshot/67/current`,
                    mlbDebut: player.mlbDebutDate
                },

                // --- 球队信息 ---
                team: {
                    id: player.currentTeam?.id,
                    name: player.currentTeam?.name || "Free Agent",
                    logo: player.currentTeam?.id ? `https://www.mlbstatic.com/team-logos/${player.currentTeam.id}.svg` : null
                },

                // --- 选秀信息 (如有) ---
                draft: player.draft ? {
                    year: player.draft[0]?.year,
                    round: player.draft[0]?.round,
                    team: player.draft[0]?.team?.name
                } : null,

                // --- 荣誉墙 (取前5个重要奖项) ---
                awards: player.awards ? player.awards.slice(0, 5).map(a => ({
                    name: a.name,
                    season: a.season
                })) : [],

                // --- 数据部分 (分为本赛季和生涯) ---
                stats: {
                    current_season: { hitting: null, pitching: null, fielding: null },
                    career: { hitting: null, pitching: null, fielding: null }
                }
            };

            // 4. 通用数据提取函数
            const extractStats = (statGroup) => {
                if (!statGroup || !statGroup.splits || statGroup.splits.length === 0) return null;
                const s = statGroup.splits[0].stat;
                // 根据 group 类型返回不同字段
                if (statGroup.group.displayName === 'hitting') {
                    return { games: s.gamesPlayed, avg: s.avg, homeRuns: s.homeRuns, rbi: s.rbi, ops: s.ops, hits: s.hits, atBats: s.atBats, stolenBases: s.stolenBases };
                }
                if (statGroup.group.displayName === 'pitching') {
                    return { games: s.gamesPlayed, era: s.era, wins: s.wins, losses: s.losses, innings: s.inningsPitched, strikeOuts: s.strikeOuts, whip: s.whip, saves: s.saves };
                }
                if (statGroup.group.displayName === 'fielding') {
                    return { games: s.gamesPlayed, position: statGroup.splits[0].position?.abbreviation, fieldingPercentage: s.fielding, errors: s.errors };
                }
                return null;
            };

            // 遍历所有 stats 数据块
            if (player.stats) {
                player.stats.forEach(group => {
                    const type = group.type.displayName; // 'season' or 'career'
                    const category = group.group.displayName; // 'hitting', 'pitching', 'fielding'

                    let targetKey = type === 'career' ? 'career' : 'current_season';

                    if (cleanData.stats[targetKey]) {
                        cleanData.stats[targetKey][category] = extractStats(group);
                    }
                });
            }

            return new Response(JSON.stringify({ status: "success", data: cleanData }), {
                headers: { ...corsHeaders, "Cache-Control": "public, max-age=300" }
            });

        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
        }
    },
};