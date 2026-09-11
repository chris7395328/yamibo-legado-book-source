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
        java.toast("未找到收藏入口：可能尚未登录，或帖子已经收藏。");
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
