$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$callbackPath = Join-Path $projectDir 'src\callback.js'
$outputPath = Join-Path $projectDir 'dist\yamibo-legado-book-source.json'
$distDir = Split-Path -Parent $outputPath

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

# 使用传统 ruleExplore/ruleBookInfo/ruleToc/ruleContent 格式，兼容尚未支持
# mainJs 单文件书源接口的 Legado 正式版。
$bookListRule = '#threadlisttableid tbody[id*=thread_],#favorite_ul li:has(a[href*=thread-]),#favorite_ul li:has(a[href*=viewthread]),.threadlist li:has(a[href*=thread-]),.threadlist li:has(a[href*=viewthread]),#threadlist li:has(a[href*=thread-]),#threadlist li:has(a[href*=viewthread])'

$itemNameJs = @'
@js:
var node = result;
var links = node.select("a.s.xst,a[href*=thread-],a[href*=viewthread]");
var title = "";
for (var i = 0; i < links.size(); i++) {
    var text = String(links.get(i).text()).replace(/\s+/g, " ").trim();
    if (text && !/^\d+$/.test(text) && !/^(New|下一页|返回|只看)/i.test(text)) { title = text; break; }
}
title;
'@

$itemUrlJs = @'
@js:
var node = result;
var finalUrl = "";
var links = node.select("a.s.xst,a[href*=thread-],a[href*=viewthread]");
for (var i = 0; i < links.size(); i++) {
    var link = links.get(i);
    var text = String(link.text()).replace(/\s+/g, " ").trim();
    if (!text || /^\d+$/.test(text) || /^(New|下一页|返回|只看)/i.test(text)) continue;
    var href = String(link.absUrl("href") || link.attr("href") || "");
    var match = href.match(/thread-(\d+)/i) || href.match(/[?&]tid=(\d+)/i);
    finalUrl = match ? "https://bbs.yamibo.com/forum.php?showmobile=no&mod=viewthread&tid=" + match[1] : href;
    break;
}
finalUrl;
'@

$itemAuthorJs = @'
@js:
var node = result;
var author = node.select("td.by cite a,td.by a,.by a,.author a").first();
author == null ? "百合会收藏" : String(author.text()).trim();
'@

$itemKindJs = @'
@js:
var node = result;
var type = node.select("a[href*=typeid]").first();
type == null ? (String(node.id()).indexOf("fav_") == 0 ? "我的收藏" : "") : String(type.text()).trim();
'@

$itemIntroJs = @'
@js:
var node = result;
var stat = node.select("td.num,.num").first();
stat == null ? "" : String(stat.text()).trim();
'@

$bookIntroJs = @'
@js:
var doc = org.jsoup.Jsoup.parse(String(result || ""), String(baseUrl || "https://bbs.yamibo.com/"));
var message = doc.select("#postlist [id^=postmessage_]").first();
var intro = "";
if (message != null) {
    var preview = message.clone();
    preview.select("script,style,.pstatus,.aimg_tip").remove();
    var text = String(preview.text()).replace(/\s+/g, " ").trim().replace(/^本帖最后由.+?编辑\s*/, "");
    intro = text.length > 200 ? text.substring(0, 200) + "…" : text;
}
intro;
'@

$bookCoverJs = @'
@js:
var pageUrl = String(baseUrl || "https://bbs.yamibo.com/");
var doc = org.jsoup.Jsoup.parse(String(result || ""), pageUrl);
var message = doc.select("#postlist [id^=postmessage_]").first();
var cover = "";
if (message != null) {
    var images = message.select("img");
    for (var i = 0; i < images.size(); i++) {
        var image = images.get(i);
        var src = String(image.attr("file") || image.attr("zoomfile") || image.attr("data-original") || image.attr("src") || "");
        if (!src || /smiley|static\/image\/common|avatar|loading/i.test(src)) continue;
        try { src = String(new Packages.java.net.URL(new Packages.java.net.URL(pageUrl), src).toString()); } catch (e) {}
        if (/^https?:\/\//i.test(src)) { cover = src; break; }
    }
}
cover;
'@

$chapterNameJs = @'
@js:
var node = result;
var floor = node.select("a[id^=postnum]").first();
var message = node.select("[id^=postmessage_]").first();
var text = message == null ? "" : String(message.text()).replace(/^本帖最后由.+?编辑\s*/, "").trim();
var heading = message == null ? null : message.select("h1,h2,h3,h4,strong,b").first();
var title = heading == null ? "" : String(heading.text()).trim();
if (!title || title.length > 48 || title.indexOf("本帖最后由") >= 0) title = text.substring(0, Math.min(36, text.length));
(floor == null ? "章节" : String(floor.text()).trim()) + (title ? " · " + title : "");
'@

$chapterUrlJs = @'
@js:
var node = result;
var message = node.select("[id^=postmessage_]").first();
message == null ? "" : String(baseUrl).replace(/#.*$/, "") + "#" + String(message.id());
'@

$contentJs = @'
@js:
var url = String(chapter.url || baseUrl || "");
var match = url.match(/#(postmessage_\d+)/);
var doc = org.jsoup.Jsoup.parse(String(result || ""), url);
var message = match ? doc.getElementById(match[1]) : doc.select("[id^=postmessage_]").first();
if (message == null) throw "没有找到这一节的正文，请确认登录状态和帖子阅读权限。";
var content = message.clone();
content.select("script,style,.pstatus,.jammer").remove();
// Legado 的网页正文净化流程不会保留 ruby/rt 排版。转换为带界定符的文本，
// 避免注音或备注与正文机械粘连，例如「漢かん」改为「漢〔かん〕」。
var rubies = content.select("ruby");
for (var r = 0; r < rubies.size(); r++) {
    var ruby = rubies.get(r);
    var annotation = String(ruby.select("rt").text()).trim();
    var baseNode = ruby.clone();
    baseNode.select("rt,rp").remove();
    var baseText = String(baseNode.text()).trim();
    ruby.text(baseText + (annotation ? "〔" + annotation + "〕" : ""));
}
var images = content.select("img");
for (var i = 0; i < images.size(); i++) {
    var image = images.get(i);
    var src = String(image.attr("file") || image.attr("zoomfile") || image.attr("data-original") || image.attr("src") || "");
    if (src) {
        try { src = String(new Packages.java.net.URL(new Packages.java.net.URL(url), src).toString()); } catch (e) {}
        image.attr("src", src);
    }
    image.removeAttr("file").removeAttr("zoomfile").removeAttr("data-original").removeAttr("onclick");
}
String(content.html()).trim();
'@

$source = [ordered]@{
    bookSourceUrl = 'https://bbs.yamibo.com'
    bookSourceName = '百合会文学区（兼容版）'
    bookSourceGroup = '百合会,论坛小说'
    bookSourceType = 0
    bookUrlPattern = 'https://bbs\.yamibo\.com/(?:thread-\d+.*\.html|forum\.php\?mod=viewthread.*(?:tid=\d+).*)'
    customOrder = 0
    enabled = $true
    enabledExplore = $true
    enabledCookieJar = $true
    # 目录分页由 Legado 顺序读取；限速避免长帖在短时间内造成高并发访问。
    concurrentRate = '1/800'
    header = '{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36","Referer":"https://bbs.yamibo.com/"}'
    loginUrl = 'https://bbs.yamibo.com/member.php?mod=logging&action=login'
    loginUi = $null
    loginCheckJs = $null
    exploreUrl = '[{"title":"文学区","url":"https://bbs.yamibo.com/forum.php?showmobile=no&mod=forumdisplay&fid=49&mobile=no&page={{page}}"},{"title":"轻小说/译文区","url":"https://bbs.yamibo.com/forum.php?showmobile=no&mod=forumdisplay&fid=55&mobile=no&page={{page}}"},{"title":"我的帖子收藏","url":"https://bbs.yamibo.com/home.php?mod=space&do=favorite&type=thread&showmobile=no&mobile=no&page={{page}}"}]'
    searchUrl = $null
    ruleExplore = [ordered]@{
        # 列表必须由 Legado 的原生 DOM 规则直接产出节点。部分正式版不会把
        # JavaScript 返回的 Elements/数组继续传给 name、bookUrl 等子规则，会直接显示 0。
        bookList = $bookListRule
        name = $itemNameJs.Trim()
        author = $itemAuthorJs.Trim()
        intro = $itemIntroJs.Trim()
        kind = $itemKindJs.Trim()
        lastChapter = ''
        updateTime = ''
        bookUrl = $itemUrlJs.Trim()
        coverUrl = ''
        wordCount = ''
    }
    ruleSearch = [ordered]@{
        bookList = ''
        name = ''
        author = ''
        intro = ''
        kind = ''
        lastChapter = ''
        updateTime = ''
        bookUrl = ''
        coverUrl = ''
        wordCount = ''
    }
    ruleBookInfo = [ordered]@{
        init = ''
        name = '#thread_subject@text'
        author = '#postlist table[id^=pid] .authi a.xw1@text'
        intro = $bookIntroJs.Trim()
        kind = ''
        lastChapter = ''
        updateTime = ''
        coverUrl = $bookCoverJs.Trim()
        tocUrl = '#postlist table[id^=pid] a[href*=authorid]@href'
        wordCount = ''
    }
    ruleToc = [ordered]@{
        preUpdateJs = ''
        chapterList = '#postlist table[id^=pid]'
        chapterName = $chapterNameJs.Trim()
        chapterUrl = $chapterUrlJs.Trim()
        formatJs = ''
        isVolume = ''
        isVip = ''
        isPay = ''
        updateTime = ''
        nextTocUrl = '.pg a.nxt@href'
    }
    ruleContent = [ordered]@{
        content = $contentJs.Trim()
        nextContentUrl = ''
        replaceRegex = ''
        imageStyle = 'FULL'
        callBackJs = (Get-Content -Raw -Encoding UTF8 $callbackPath)
    }
    bookSourceComment = '传统规则兼容版。仅抓取文学区（fid=49）和轻小说/译文区（fid=55），并支持当前账号的帖子收藏。目录通过论坛“只看该作者”分页顺序生成；长帖建议读完后再手动刷新目录。阅读页的书源功能按钮：登录后点击收藏；未登录点击会直接打开登录页；长按打开原帖。'
    lastUpdateTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    respondTime = 180000
    weight = 0
    eventListener = $true
    customButton = $true
}

$json = "[`n" + ($source | ConvertTo-Json -Depth 20) + "`n]"
[System.IO.File]::WriteAllText($outputPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output $outputPath
