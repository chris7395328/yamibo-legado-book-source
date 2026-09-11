/**
 * 百合会文学区 - Legado JavaScript 书源
 *
 * 帖子视为书籍，只看楼主页面中的每个楼主楼层视为章节。
 * 由 build.ps1 打包进可导入的 JSON；不要直接导入本文件，否则收藏按钮配置不会被带入。
 */

var config = {
    bookSourceUrl: "https://bbs.yamibo.com",
    bookSourceName: "百合会文学区",
    bookSourceType: 0,
    bookSourceGroup: "百合会,论坛小说",
    bookUrlPattern: "https://bbs\\.yamibo\\.com/(?:thread-\\d+.*\\.html|forum\\.php\\?mod=viewthread.*(?:tid=\\d+).*)",
    loginUrl: "https://bbs.yamibo.com/member.php?mod=logging&action=login",
    enabledCookieJar: true,
    concurrentRate: "4/1000",
    exploreUrl: [
        { title: "文学区", url: "https://bbs.yamibo.com/forum-49-1.html" },
        { title: "轻小说/译文区", url: "https://bbs.yamibo.com/forum-55-1.html" },
        { title: "我的帖子收藏", url: "https://bbs.yamibo.com/home.php?mod=space&do=favorite&type=thread" }
    ],
    bookSourceComment: "仅抓取文学区（fid=49）和轻小说/译文区（fid=55）。登录请在书源菜单中打开网页登录。帖子按“只看楼主”整理成阅读章节。阅读页底部自定义按钮：点击收藏帖子，长按打开原帖。",
    lastUpdateTime: 1789117200000
};

var Jsoup = org.jsoup.Jsoup;

function textOf(element) {
    return element == null ? "" : String(element.text()).replace(/\s+/g, " ").trim();
}

function parseHtml(html, url) {
    return Jsoup.parse(String(html || ""), String(url || config.bookSourceUrl));
}

function absoluteUrl(element, attribute, base) {
    if (element == null) return "";
    var value = String(element.attr(attribute) || "");
    if (!value) return "";
    try {
        return String(new java.net.URL(new java.net.URL(String(base)), value).toString());
    } catch (e) {
        return value;
    }
}

function threadId(url) {
    var value = String(url || "");
    var match = value.match(/thread-(\d+)/i) || value.match(/[?&]tid=(\d+)/i);
    return match ? match[1] : "";
}

function canonicalThreadUrl(url) {
    var tid = threadId(url);
    return tid ? config.bookSourceUrl + "/thread-" + tid + "-1-1.html" : String(url || "");
}

function requireReadablePage(doc) {
    var message = doc.select("#messagetext, .alert_info, .locked").first();
    var bodyText = textOf(doc.body());
    if (message != null && doc.select("[id^=postmessage_]").isEmpty()) {
        throw textOf(message) || "帖子当前不可读，请先登录百合会并确认账号阅读权限。";
    }
    if (/请先登录|您需要登录|没有权限访问|阅读权限/.test(bodyText) && doc.select("[id^=postmessage_]").isEmpty()) {
        throw "帖子当前不可读，请先登录百合会并确认账号阅读权限。";
    }
}

function pageUrl(url, page) {
    var value = String(url || "");
    if (/forum-\d+-\d+\.html/i.test(value)) {
        return value.replace(/(forum-\d+-)\d+(\.html)/i, "$1" + page + "$2");
    }
    return value + (value.indexOf("?") >= 0 ? "&" : "?") + "page=" + page;
}

function bookFromThreadRow(row, base) {
    var titleLink = row.select("a.s.xst").first();
    if (titleLink == null) return null;
    var href = absoluteUrl(titleLink, "href", base);
    var tid = threadId(href);
    if (!tid) return null;
    var authorLink = row.select("td.by cite a, td.by a").first();
    var typeLink = row.select("a[href*=filter\\=typeid]").first();
    var stats = row.select("td.num").first();
    var title = textOf(titleLink);
    title = title.replace(/^\[[^\]]+\]\s*/, "").trim();
    return {
        name: title,
        author: textOf(authorLink) || "百合会用户",
        kind: textOf(typeLink),
        intro: textOf(stats),
        bookUrl: canonicalThreadUrl(href),
        tocUrl: canonicalThreadUrl(href),
        latestChapterTitle: "打开查看楼主更新"
    };
}

function booksFromForum(html, url, key) {
    var doc = parseHtml(html, url);
    var rows = doc.select("#threadlisttableid tbody[id^=normalthread_]");
    var books = [];
    var needle = String(key || "").toLowerCase();
    for (var i = 0; i < rows.size(); i++) {
        var book = bookFromThreadRow(rows.get(i), url);
        if (book == null) continue;
        if (needle && String(book.name).toLowerCase().indexOf(needle) < 0) continue;
        books.push(book);
    }
    return books;
}

function booksFromFavorites(html, url) {
    var doc = parseHtml(html, url);
    if (!doc.select("a[href*=logging][href*=login]").isEmpty() && doc.select("#favorite_ul").isEmpty()) {
        throw "请先在书源菜单中登录百合会，再查看帖子收藏。";
    }
    var items = doc.select("#favorite_ul li[id^=fav_], #favorite_ul [id^=fav_]");
    var books = [];
    var seen = {};
    for (var i = 0; i < items.size(); i++) {
        var link = items.get(i).select("a[href*=thread-], a[href*=mod\\=viewthread]").first();
        if (link == null) continue;
        var href = canonicalThreadUrl(absoluteUrl(link, "href", url));
        if (!threadId(href) || seen[href]) continue;
        seen[href] = true;
        books.push({
            name: textOf(link),
            author: "百合会收藏",
            kind: "我的收藏",
            intro: textOf(items.get(i)),
            bookUrl: href,
            tocUrl: href,
            latestChapterTitle: "打开查看楼主更新"
        });
    }
    return books;
}

function uniqueBooks(books) {
    var result = [];
    var seen = {};
    for (var i = 0; i < books.length; i++) {
        var key = String(books[i].bookUrl || "");
        if (!key || seen[key]) continue;
        seen[key] = true;
        result.push(books[i]);
    }
    return result;
}

function explore(url, page) {
    var target = pageUrl(String(url), Math.max(1, Number(page || 1)));
    var html = java.ajax(target);
    if (String(url).indexOf("do=favorite") >= 0) return booksFromFavorites(html, target);
    return booksFromForum(html, target, "");
}

function firstPost(doc) {
    return doc.select("#postlist [id^=postmessage_]").first();
}

function getBookInfo(book) {
    var url = canonicalThreadUrl(book.bookUrl);
    var html = java.ajax(url);
    var doc = parseHtml(html, url);
    requireReadablePage(doc);
    var message = firstPost(doc);
    if (message == null) throw "没有找到帖子正文。";
    var title = textOf(doc.select("#thread_subject").first()) || String(book.name || "百合会帖子");
    var post = message.closest("div[id^=post_]");
    var authorLink = post == null ? null : post.select(".authi a.xw1, .authi a").first();
    var authorOnly = post == null ? null : post.select("a[href*=authorid]").first();
    var authorFromLine = "";
    var messageHtml = String(message.html() || "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n");
    var authorMatch = messageHtml.match(/(?:^|[\n【「『（(])\s*(?:原作者|作者|原著|著)\s*[:：、，,]?\s*([^。！？；;，,：:【】「」『』（）()<>]{1,40})/i)
        || messageHtml.match(/(?:原作者|作者|原著|著)\s*[:：、，,]\s*([^。！？；;，,：:【】「」『』（）()<>]{1,40})/i);
    if (authorMatch) authorFromLine = String(authorMatch[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    var intro = textOf(message);
    if (intro.length > 800) intro = intro.substring(0, 800) + "……";
    var cover = "";
    var images = message.select("img");
    for (var i = 0; i < images.size(); i++) {
        var candidate = absoluteUrl(images.get(i), images.get(i).hasAttr("file") ? "file" : "src", url);
        if (candidate && candidate.indexOf("smiley") < 0) {
            cover = candidate;
            break;
        }
    }
    return {
        name: title,
        author: authorFromLine || textOf(authorLink) || String(book.author || "百合会用户"),
        intro: intro,
        coverUrl: cover,
        tocUrl: authorOnly == null ? url : absoluteUrl(authorOnly, "href", url),
        latestChapterTitle: "按楼主发帖顺序阅读"
    };
}

function maxAuthorPage(doc) {
    var max = 1;
    var links = doc.select(".pg a[href]");
    for (var i = 0; i < links.size(); i++) {
        var href = String(links.get(i).attr("href"));
        var match = href.match(/[?&]page=(\d+)/i) || href.match(/thread-\d+-(\d+)-\d+\.html/i);
        if (match) max = Math.max(max, Number(match[1]));
    }
    return max;
}

function authorPageUrl(tid, authorId, page) {
    return config.bookSourceUrl + "/forum.php?mod=viewthread&tid=" + tid + "&authorid=" + authorId + "&page=" + page;
}

function shortChapterTitle(message, index) {
    var preferred = message.select("h1,h2,h3,h4,strong,b");
    for (var i = 0; i < preferred.size(); i++) {
        var value = textOf(preferred.get(i));
        if (value && value.length <= 48 && value.indexOf("本帖最后由") < 0) {
            return "第" + index + "节 · " + value;
        }
    }
    var text = textOf(message).replace(/^本帖最后由.+?编辑\s*/, "");
    if (text.length > 32) text = text.substring(0, 32) + "…";
    return "第" + index + "节" + (text ? " · " + text : "");
}

function chaptersFromDocument(doc, url, startIndex) {
    var messages = doc.select("#postlist [id^=postmessage_]");
    var chapters = [];
    for (var i = 0; i < messages.size(); i++) {
        var message = messages.get(i);
        var id = String(message.id());
        if (!id) continue;
        var index = startIndex + chapters.length;
        chapters.push({
            title: shortChapterTitle(message, index),
            url: String(url).replace(/#.*$/, "") + "#" + id
        });
    }
    return chapters;
}

function getChapters(book) {
    var initialUrl = String(book.tocUrl || book.bookUrl);
    var html = java.ajax(initialUrl);
    var doc = parseHtml(html, initialUrl);
    requireReadablePage(doc);
    var tid = threadId(initialUrl) || threadId(book.bookUrl);
    var authorMatch = initialUrl.match(/[?&]authorid=(\d+)/i);
    if (!authorMatch) {
        var first = doc.select("#postlist > div[id^=post_], #postlist div[id^=post_]").first();
        var link = first == null ? null : first.select("a[href*=authorid]").first();
        if (link != null) {
            initialUrl = absoluteUrl(link, "href", initialUrl);
            authorMatch = initialUrl.match(/[?&]authorid=(\d+)/i);
            html = java.ajax(initialUrl);
            doc = parseHtml(html, initialUrl);
        }
    }
    if (!tid || !authorMatch) throw "无法确定帖子楼主，不能生成阅读目录。";
    var authorId = authorMatch[1];
    var maxPage = maxAuthorPage(doc);
    var pageOne = authorPageUrl(tid, authorId, 1);
    var chapters = chaptersFromDocument(doc, pageOne, 1);
    if (maxPage > 1) {
        var urls = [];
        for (var p = 2; p <= maxPage; p++) urls.push(authorPageUrl(tid, authorId, p));
        var responses = java.ajaxAll(urls);
        for (var r = 0; r < responses.length; r++) {
            var pageDoc = parseHtml(responses[r].body(), urls[r]);
            chapters = chapters.concat(chaptersFromDocument(pageDoc, urls[r], chapters.length + 1));
        }
    }
    if (!chapters.length) throw "没有找到楼主正文。";
    return chapters;
}

function cleanMessageHtml(message, pageUrlValue) {
    var content = message.clone();
    content.select("script,style,.pstatus,.jammer").remove();
    var images = content.select("img");
    for (var i = 0; i < images.size(); i++) {
        var image = images.get(i);
        var src = String(image.attr("file") || image.attr("zoomfile") || image.attr("data-original") || image.attr("src") || "");
        if (src) {
            try { src = String(new java.net.URL(new java.net.URL(String(pageUrlValue)), src).toString()); } catch (e) {}
            image.attr("src", src);
        }
        image.removeAttr("file").removeAttr("zoomfile").removeAttr("data-original").removeAttr("onclick");
    }
    var links = content.select("a[href]");
    for (var j = 0; j < links.size(); j++) {
        links.get(j).attr("href", absoluteUrl(links.get(j), "href", pageUrlValue));
    }
    return String(content.html()).trim();
}

function getContent(chapter, book, nextChapterUrl) {
    var fullUrl = String(chapter.url || "");
    var parts = fullUrl.split("#");
    var pageUrlValue = parts[0];
    var messageId = parts.length > 1 ? parts[1] : "";
    var html = java.ajax(pageUrlValue);
    var doc = parseHtml(html, pageUrlValue);
    requireReadablePage(doc);
    var message = messageId ? doc.getElementById(messageId) : firstPost(doc);
    if (message == null) throw "没有找到这一节的正文，帖子结构可能已变化。";
    var result = cleanMessageHtml(message, pageUrlValue);
    if (!result) throw "这一节没有可读取的正文。";
    return result;
}
