(function () {
    var eventName = String(event || "");
    if (eventName === "longClickCustomButton") {
        java.showBrowser(String(book.bookUrl));
        return true;
    }
    if (eventName !== "clickCustomButton") return false;

    var pageUrl = String(book.bookUrl);
    var html = java.ajax(pageUrl);
    var doc = org.jsoup.Jsoup.parse(String(html), pageUrl);
    var favorite = doc.select("#k_favorite").first();
    if (favorite == null) {
        var pageText = String(doc.text() || "");
        var loginLink = doc.select("a[href*=logging][href*=login],a[href*=member.php][href*=login]").first();
        if (loginLink != null || /请先登录|您需要登录|登录后/.test(pageText)) {
            // 阅读页的书源功能按钮兼作快捷登录入口：未登录时点击直接打开登录页。
            java.showBrowser("https://bbs.yamibo.com/member.php?mod=logging&action=login");
            java.toast("请在打开的页面完成百合会登录");
        } else {
            java.toast("未找到收藏入口：这个帖子可能已经收藏，或论坛页面结构有变化。");
        }
        return true;
    }
    var favoriteUrl = String(favorite.absUrl("href"));
    if (!favoriteUrl) {
        java.toast("无法取得收藏地址，请重新登录后再试。");
        return true;
    }
    var response = java.ajax(favoriteUrl);
    var message = String(org.jsoup.Jsoup.parse(String(response)).text());
    if (message.indexOf("收藏成功") >= 0 || message.indexOf("信息收藏成功") >= 0) {
        java.toast("已收藏到百合会");
    } else if (message.indexOf("已经收藏") >= 0) {
        java.toast("这个帖子已经收藏过了");
    } else if (message.indexOf("登录") >= 0) {
        java.toast("收藏失败：请先登录百合会");
    } else {
        java.longToast("百合会返回：" + message.substring(0, Math.min(80, message.length)));
    }
    return true;
})()
