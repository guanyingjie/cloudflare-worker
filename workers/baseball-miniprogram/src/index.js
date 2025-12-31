const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // 1. 处理 CORS 预检
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS', // Gemini 通常只用 POST
                    'Access-Control-Allow-Headers': '*',
                },
            });
        }

        // 2. 解析 Request Body
        // 我们必须读取 body 才能获取 source，但 body 流只能读一次
        // 所以读出来后，后续都要用这个 parse 出来的对象
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return new Response('Invalid JSON', { status: 400 });
        }

        // 3. 提取 source 字段用于缓存 Key
        // 假设结构是: body.contents[0].source
        const source = body.contents?.[0]?.source;

        // 4. 尝试读取缓存
        const cache = caches.default;
        let cacheKey = null;

        if (source) {
            // 使用 source 生成一个唯一的伪造 URL 作为缓存 Key
            // 注意：encodeURIComponent 用于处理 source 中可能包含的特殊字符
            cacheKey = new Request(`https://gemini-cache.local/${encodeURIComponent(source)}`, {
                method: 'GET',
            });

            // 检查缓存中是否有数据
            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) {
                console.log(`Cache HIT for source: ${source}`);
                // 命中缓存！重新构造 Response 以确保 CORS 头正确
                const newRes = new Response(cachedResponse.body, cachedResponse);
                newRes.headers.set('Access-Control-Allow-Origin', '*');
                return newRes;
            }
            console.log(`Cache MISS for source: ${source}`);
        }

        // 5. 准备转发给 Google 的请求
        // ⚠️ 关键步骤：删除 source 字段，因为 Google API 不识别它
        if (body.contents && body.contents[0] && body.contents[0].source) {
            delete body.contents[0].source;
        }

        // 拼接 Google 的真实地址
        const targetUrl = GEMINI_API_BASE + url.pathname + url.search;

        // 创建 Clean Headers (保留之前的修复逻辑)
        const cleanHeaders = new Headers();
        cleanHeaders.set('Content-Type', 'application/json');

        // 创建新请求
        const upstreamRequest = new Request(targetUrl, {
            method: 'POST', // 强制 POST，因为我们要发 body
            headers: cleanHeaders,
            body: JSON.stringify(body) // 使用清洗后的 JSON 字符串
        });

        // 6. 发送给 Google
        const response = await fetch(upstreamRequest);

        // 7. 处理响应并写入缓存
        // 我们需要克隆 response，一份给用户，一份存缓存
        // 如果响应成功 (200) 且有 source，则存入缓存
        if (response.ok && source && cacheKey) {
            // 克隆响应以存入缓存
            const resToCache = response.clone();
            const headers = new Headers(resToCache.headers);

            // 设置缓存时间为 1 个月 (2592000 秒)
            headers.set('Cache-Control', 'public, max-age=2592000');
            // 确保没有 Set-Cookie，否则 Cloudflare 不会缓存
            headers.delete('Set-Cookie');

            const responseForCache = new Response(resToCache.body, {
                status: resToCache.status,
                statusText: resToCache.statusText,
                headers: headers
            });

            // 使用 ctx.waitUntil 异步写入缓存，不阻塞返回给用户的速度
            ctx.waitUntil(cache.put(cacheKey, responseForCache));
        }

        // 8. 返回给用户
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Access-Control-Allow-Origin', '*');

        return newResponse;
    },
};