const debug = false;
const test = false;
debugLog = debug ? console.log.bind(null, "backgrount.js DEBUG:") : () => { };
testLog = test ? console.log.bind(null, "backgrount.js TEST:") : () => { };

const SAVE_DELAY = 60 * 1000;
const PAGE_GET_INTERVAL_MS = 20 * 1000;
const XHR_TIMEOUT_MS = 3 * 1000;
const PAGE_DISPLAY_LENGTH = 40;
const PAGE_NUMBER_BY_TOKEN_LIMIT = 40;
const HISTORY_MAX_LOAD = 50000;
const PAGE_GET_QUEUE_REDUCE_NUMBER = 10000;
const HISTORY_VISITCOUNT_THRESHOLD = 0;
const PAGE_FREE_INTERVAL_MS = 10 * 1000;
const PAGE_NUMBER_LIMIT = 200000;
const PAGE_FREE_SELECT_NUMBER = 10;
const HISTORY_LOAD = true;
const BOOKMARK_LOAD = true;
const TOKEN_REWARD_ON_RECOMMEND = 0.01;
const TOKEN_REWARD_ON_REGISTER = 0.01;
const TOKEN_REWARD_ON_IGNORED = -0.1;
const TOKEN_REWARD_ON_DELETE = -1.0;
const TOKEN_REWARD_ON_SELECT = 1.0;

class PagesByToken extends Map {
    get(key) {
        const _get = super.get(key)
        if (!_get) {
            super.set(key, new Set());
        }
        return super.get(key)
    }
    size_get(key) {
        const values = super.get(key);
        if (!values) {
            return 0;
        }
        return values.size;
    }
    add(key, value) {
        if(value){
            this.get(key).add(value);

        }
    }
}

page_get_queue = new Set();
tokenizer = new Tokenizer();
pagesByToken = new PagesByToken();
pageByUrl = new Map();
bookmarkedUrlSet = new Set();
tokens_ng = new Set();

async function init() {
    debugLog("init...");

    bookmarkedUrlSet = await bookmark_urlset();
    load().then(async () => {
        if (BOOKMARK_LOAD) { await pages_create_from_bookmarks_without_network() }
        if (HISTORY_LOAD) {
            const histories = await history_array();
            await pages_from_history(histories);
        }
    });

    browser.runtime.onMessage.addListener(recommend_on_message);
    browser.runtime.onMessage.addListener(page_register_on_message);
    browser.runtime.onMessage.addListener(pages_register_on_message);
    browser.runtime.onMessage.addListener(page_delete_on_message);
    browser.runtime.onMessage.addListener(pages_delete_on_message);
    browser.runtime.onMessage.addListener(recommend_selected_on_message);

    browser.bookmarks.onCreated.addListener(bookmark_urlset_reset);
    browser.bookmarks.onRemoved.addListener(bookmark_urlset_reset);
    browser.bookmarks.onChanged.addListener(bookmark_urlset_reset);

    setInterval(prowl, PAGE_GET_INTERVAL_MS);

    setInterval(async () => {
        const pages_number = pageByUrl.size;
        if (pages_number <= PAGE_NUMBER_LIMIT) { return }
        if (pages_number <= PAGE_FREE_SELECT_NUMBER) { return }
        for (let i = 0; i < pages_number - PAGE_NUMBER_LIMIT; i++) {
            await pages_free(PAGE_FREE_SELECT_NUMBER);
        }
        console.assert(pageByUrl.size == PAGE_NUMBER_LIMIT, pageByUrl.size);
    }, PAGE_FREE_INTERVAL_MS);
    debugLog("...init");
}

async function recommend_selected_on_message(message, sender) {
    if (!message.recommend_selected) { return }
    debugLog("message", message);
    const page_selected = pageByUrl.get(message.page.url);
    page_tokens_weight_learn(page_selected, TOKEN_REWARD_ON_SELECT);
}

function page_tokens_weight_learn(page, reward) {
    const LEARNING_ALPHA = 0.1
    for (token_object of page.token_objects) {
        const weight_delta = -1.0 * LEARNING_ALPHA * reward * Math.pow(pagesByToken.size_get(token_object.string) + 1, -2)
        token_object.weight -= weight_delta;
    }
}

async function bookmark_urlset_reset() {
    bookmarkedUrlSet = await bookmark_urlset();
}

async function prowl() {
    const page = page_get_queue.values().next().value;
    page_get_queue.delete(page);
    if (!page) { return }
    if (await page.text_content.length > 0) { return }

    const pages_got = await Page_get.createPageAndLinkedPagesFromUrl(page.url).catch(e => {
        console.warn(`createPageAndLinkedPagesFromUrl  url:${url}, error:${e}`);
        return null;
    });
    if (pages_got == null) { return };

    for (const page_got of pages_got) {
        page_got.isBookmarked = bookmarkedUrlSet.has(page_got.url);
        page_register(page_got);
    }

    debugLog("pages_got", pages_got);

}

init()

async function pages_free(select_number, pageByUrl_ = pageByUrl) {
    const pages_base = Object.values(pageByUrl_);
    if (pages_base.length < select_number) { return }
    const pages = new Set();
    for (let i = 0; i < pages_base.length; i++) {
        const page = array_choice(pages_base);
        pages.add(page);

        if (pages.size >= select_number) { break }
    }
    console.assert(pages.size == select_number, pages.size);

    const page_score_by_page = new Map();
    [...pages].map(page => [page, page_score(page)])
        .forEach(([page, score]) => page_score_by_page.set(page, score));
    console.assert([...page_score_by_page.values()].filter(score => score == Infinity).length == 0, page_score_by_page);

    const pages_sorted = [...pages].sort((p1, p2) => page_score_by_page.get(p1) - page_score_by_page.get(p2));
    console.assert(pages_sorted[0] != pages_sorted[select_number - 1] && page_score(pages_sorted[0]) <= page_score(pages_sorted[select_number - 1]), page_score(pages_sorted[0]), page_score(pages_sorted[select_number - 1]))
    console.assert(pages_sorted.length == select_number, { pages_sorted: pages_sorted, pageByUrl_: pageByUrl_ });

    page_delete(pages_sorted[0]);
}

function array_choice(array) {
    return array[Math.floor(Math.random() * array.length)];
}
Test.test_配列からランダムな要素が取り出されること = function () {
    const array_size = 10000;
    const array = [0, 1, 2, 3, 4];
    const array_choiced = Array(array_size).fill(0)
        .map(_ => array_choice(array));
    const count_array = Array(5).fill(0);
    array_choiced.forEach(e => count_array[e]++);
    Test.assert(count_array[0] > 10 && count_array[1] > 10 && count_array[2] > 10 && count_array[3] > 10 && count_array[4] > 10 && count_array[1] > 10 && count_array[1] > 10, count_array);
    Test.assert(count_array.length == 5);
    const array_choiced_sum = array_choiced.reduce((a, b) => a + b);
    Test.assert(array_choiced_sum < array_size * (0 + 1 + 2 + 3 + 4) / 5 + array_size, array_choiced_sum);
    Test.assert(array_choiced_sum > array_size * (0 + 1 + 2 + 3 + 4) / 5 - array_size, array_choiced_sum);
    Test.assert(count_array.reduce((a, b) => a + b) == array_size, count_array);
}

async function load() {
    const urls = (await LocalStorage.keys())
        .filter(url => url.match(/^https?/g))
        .filter(url => !url_is_exist(url));
    if (!urls) { return }
    const promises = urls.map(async url => {
        const page = await Page.load(url, bookmarkedUrlSet);
        if (!page) { return }
        await page_register(page);
    });
    await Promise.all(promises);
}

let savingTimeout;
async function page_register(page) {
    console.assert(page != undefined, page);
    console.assert(page.constructor == Page, page);

    if (page.title == "") {
        return;
    }
    if (pageByUrl.get(page.url) && await pageByUrl.get(page.url).text_content == await page.text_content) {
        return;
    }
    if (pageByUrl.get(page.url) && await pageByUrl.get(page.url).text_content != "" && await page.text_content == "") {
        return
    }

    const page_old = pageByUrl.get(page.url);
    if (page_old) {
        page_old.tokens.forEach(token => {
            pagesByToken.get(token).delete(page_old);
            if (pagesByToken.size_get(token) == 0) {
                pagesByToken.delete(token);
            }
        });
    }

    const tokens_alive = page.tokens.filter(token => !tokens_ng.has(token));
    if (tokens_alive.length == 0) { return }
    page.tokens = tokens_alive;
    page.tokens.forEach(token => {
        pagesByToken.add(token, page);
    });
    pageByUrl.set(page.url, page);

    console.assert(pageByUrl.get(page.url) == page);
    console.assert(!page.tokens.find(token => !pagesByToken.get(token).has(page)), page);
}

function tokens_too_many_within_page_set_ng(page) {
    const tokens_alive_within_page = page.tokens.filter(token => !tokens_ng.has(token))
    tokens_too_many_set_ng(tokens_alive_within_page);
}

function tokens_too_many_set_ng(token_array) {
    token_array.forEach(token => {
        if (pagesByToken.size_get(token) > PAGE_NUMBER_BY_TOKEN_LIMIT) {
            token_set_ng(token);
            return;
        }
    });
    Test.assert(Object.values(pageByUrl).filter(p => p.tokens.length == 0).length == 0, Object.values(pageByUrl).filter(p => p.tokens.length == 0));
}

function token_set_ng(token) {
    tokens_ng.add(token);
    for (page of pagesByToken.get(token)) {
        page.tokens = page.tokens.filter(token => !tokens_ng.has(token))
        if (page.tokens.length == 0) {
            page_delete(page);
        } else {
            page.save();
        }
    }
    pagesByToken.delete(token);

    console.assert(!pagesByToken.has(token), token);
}

function page_delete(page_) {
    const page = pageByUrl.get(page_.url);
    for (pages of pagesByToken.values()) {
        pages.delete(page);
        pages.delete(page_);
    }
    pageByUrl.delete(page.url);
    page.delete();

    console.assert(pageByUrl.get(page.url) != page);
    console.assert(!page.tokens.find(token => pagesByToken.get(token).has(page)), page);
}

async function recommend_on_message(message, sender) {
    if (message.type != "recommend") { return }
    console.assert(typeof message.page.text_request == "string", message);

    debugLog("message", message);

    const title = "";
    const innerText = message.page.text_request;
    const tokens = await tokens_calc(title + "\n" + innerText);
    const isBookmarked = bookmarkedUrlSet.has(message.page.url);
    const page = new Page(message.page.url, tokens, innerText, title, isBookmarked, sender.tab);

    const sortedPages = await pages_sorted_calc(page);
    const sortedTokens = await tokens_sorted_calc(page.tokens);
    page_related_display(sortedPages, sortedTokens);
    関連ページに表示されてるやつの中から情報持ってない奴はサイトにアクセスして情報とってくる(sortedPages);

    page_get_queue_resize();
    page_get_queue_sort();

    pages_tokens_weight_reduce(sortedPages);
    
    page_tokens_weight_learn(page, TOKEN_REWARD_ON_RECOMMEND);
}

function pages_tokens_weight_reduce(pages) {
    for (page of pages) {
        page_tokens_weight_learn(page, TOKEN_REWARD_ON_IGNORED);
    }
}

async function page_register_on_message(message, sender) {
    if (message.type != "register") { return }
    console.assert(typeof message.page.text_content == "string", message);
    debugLog("message", message);

    const title = message.page.title;
    const innerText = message.page.text_content;
    const tokens = (await tokens_calc(title + "\n" + innerText)).concat(tokens_from_url(message.page.url));
    const isBookmarked = await url_is_bookmarked(message.page.url);
    const favicon_url = message.page.favicon_url;
    const page = new Page(message.page.url, tokens, innerText, title, isBookmarked, null, favicon_url);
    debugLog("Registering page");
    await page_register(page);
    page_tokens_weight_learn(page, TOKEN_REWARD_ON_REGISTER);
}
Test.test_ページを登録できること = function () {
    setTimeout(async () => {
        const page_ = { url: "https://example1.com/", text_content: "example1 text fvtgbzamikolpxscerynhujwd", title: "example1 site" };
        const message = { page: page_, type: "register" }
        await page_register_on_message(message, null);

        const page = pageByUrl.get(page_.url);
        console.assert(pageByUrl.get(page.url) == page);
        console.assert(!page.tokens.find(token => !pagesByToken.get(token).has(page)), page);
        console.assert(page.tokens.includes("fvtgbzamikolpxscerynhujwd"), page);

        page_delete(page);
        console.assert(!pageByUrl.get(page.url), pageByUrl.get(page.url));
        console.assert(![...pagesByToken.values()].find(pages => pages.has(page)));
    }, 5000)
}

function tokens_from_url(url) {
    return domain_from_url(url).split(".");
}
Test.test_URLのドメインをトークンにできること = function () {
    const url = "https://example.com";
    const tokens = tokens_from_url(url);
    Test.assert(JSON.stringify(tokens) == JSON.stringify(["example", "com"]), tokens);
}
Test.test_URLに変な文字列が入っていたら空配列を返すこと = function () {
    const url = "うぇｊふぉい；かうぇｈ";
    const tokens = tokens_from_url(url);
    Test.assert(JSON.stringify(tokens) == JSON.stringify([""]), tokens);
}

function domain_from_url(url) {
    const match = url.match(/^https?:\/{2,}(.*?)(?:\/|\?|#|$)/);
    if (match) {
        return match[1];
    }
    return "";
}

function pages_delete_on_message(message, sender) {
    if (!message.pages_delete) { return }
    const urls = message.pages.map(page => page.url);
    for (url of urls) {
        const page = pageByUrl.get(url);
        if (!page) { continue }
        page_tokens_weight_learn(page, TOKEN_REWARD_ON_DELETE);
        page_delete(page);
    }
    console.assert(urls.filter(url => pageByUrl.get(url)).length == 0, message);
}

function page_delete_on_message(message, sender) {
    if (!message.page_delete) { return }
    const page = pageByUrl.get(message.page.url);
    page_delete(page);
    page_tokens_weight_learn(page, TOKEN_REWARD_ON_DELETE);
    console.assert(!pageByUrl.get(page.url))
}

async function pages_register_on_message(message, sender) {
    if (!message.type == "registers") { return }

    for (page_in_message of message.pages) {
        const title = page_in_message.title;
        const text_content = page_in_message.text_content;
        const url = page_in_message.url;
        const tokens = (await tokens_calc(title + "\n" + text_content)).concat(tokens_from_url(url));
        const isBookmarked = bookmarkedUrlSet.has(page_in_message.url);
        const page = new Page(page_in_message.url, tokens, text_content, title, isBookmarked, null);
        page_register(page);
        page_tokens_weight_learn(page, TOKEN_REWARD_ON_REGISTER);
    }
}
Test.test_一つのメッセージで送られた複数のページを一括で登録できること = function () {
    setTimeout(async () => {
        const pages = [
            { url: "https://example1.com/", text_content: "example1 text azqwsxedcrfvtbgy", title: "example1 site" },
            { url: "https://example2.com/", text_content: "example2 text vcrfxvtbgytbgysed", title: "example2 site" },
        ]
        const message = { pages: pages, type: "registers" }
        await pages_register_on_message(message, null);

        for (page_ of pages) {
            const page = pageByUrl.get(page_.url);
            console.assert(pageByUrl.get(page.url) == page, page);
            console.assert(!page.tokens.find(token => !pagesByToken.get(token).has(page)), page)
        }
        console.assert(pagesByToken.get("azqwsxedcrfvtbgy"));
        console.assert(pagesByToken.get("vcrfxvtbgytbgysed"));

        for (page_ of pages) {
            const page = pageByUrl.get(page_.url);
            page_delete(page);
        }
    }, 5000)
}
Test.test_urlが同じページが登録されても古い奴が消されていること = function () {
    setTimeout(async () => {
        if (pageByUrl.has("https://example.com/")) {
            page_delete(pageByUrl.get("https://example.com/"));
        }
        const pages = [
            { url: "https://example.com/", text_content: "example3 text azqwsxedcrfvtbgy", title: "example1 site" },
            { url: "https://example.com/", text_content: "example3 text vcrfxvtbgytbgyse", title: "example2 site" },
        ]
        const message = { pages: pages, type: "registers" }
        await pages_register_on_message(message, null);
        await sleep(1000);

        for (page_ of pages) {
            const page = pageByUrl.get(page_.url);
            console.assert(pageByUrl.get(page.url) == page, page);
            console.assert(!page.tokens.find(token => !pagesByToken.get(token).has(page)), page)
        }
        console.assert(pagesByToken.size_get("azqwsxedcrfvtbgy") == 0, pagesByToken.get("azqwsxedcrfvtbgy"));
        console.assert(pagesByToken.size_get("vcrfxvtbgytbgyse") == 1, pagesByToken.get("vcrfxvtbgytbgyse"));
        console.assert(![...pagesByToken.entries()].find(e => [...e[1]].find(p => p.tokens.includes("azqwsxedcrfvtbgy") && p.url == "https://example.com/")), [...pagesByToken.entries()].find(e => [...e[1]].find(p => p.tokens.includes("azqwsxedcrfvtbgy") && p.url == "https://example.com/")));

        page_delete(pageByUrl.get("https://example.com/"));
    }, 5000);
}

function urls_get_by_token(token) {
    const urls = new Set();
    const pages = pagesByToken.get(token)
    for (page of pages) {
        urls.add(page.url)
    }
    return urls;
}

async function pages_sorted_calc(page_target) {
    const urlset_list = page_target.tokens
        .filter(token => pagesByToken.size_get(token) > 1)
        .filter(token => PAGE_NUMBER_BY_TOKEN_LIMIT > pagesByToken.size_get(token))
        .map(token => urls_get_by_token(token))
        .sort((set1, set2) => set1.size > set2.size);

    const urlset = new Set();
    urlset_list.forEach(tmpUrlSet => {
        for (let url of tmpUrlSet) {
            urlset.add(url);
        }
        if (urlset.size > PAGE_DISPLAY_LENGTH * 4) {
            return;
        }
    });
    const pages_scores_by_url_ = await pages_scores_by_url(page_target, urlset, urlset_list).catch(e=>console.error(e));

    urlset.delete(page_target.url);

    const sortedPages = Array.from(urlset)
        .sort((url1, url2) => pages_scores_by_url_[url2] - pages_scores_by_url_[url1])
        .map(url => pageByUrl.get(url))
        .slice(0, PAGE_DISPLAY_LENGTH);

    console.assert(sortedPages.length <= 1 || pages_scores_by_url_[sortedPages[0].url] >= pages_scores_by_url_[sortedPages[sortedPages.length - 1].url], sortedPages);

    return sortedPages;
}

async function tokens_sorted_calc(tokens) {
    return tokens
        .filter(token => pagesByToken.size_get(token) > 1)
        .sort((token1, token2) => pagesByToken.size_get(token1) > pagesByToken.size_get(token2));
}

async function page_related_display(sortedPages, sortedTokens) {
    const pages = await Promise.all(sortedPages.map(async page => await page.clone()));
    Test.assert(!pages.find(it => !it.url), pages);
    const message = { sortedPages: pages, sortedTokens: sortedTokens, type: "display_related_page" };
    debugLog("message", message);
    browser.runtime.sendMessage(message);
}



async function 関連ページに表示されてるやつの中から情報持ってない奴はサイトにアクセスして情報とってくる(sortedPages) {
    const text_content_array = await Promise.all(
        sortedPages.map(page => page.text_content));
    const _pages = sortedPages
        .filter((page, i) => text_content_array[i] == "")
        .slice()
        .reverse();
    page_get_queue = new Set(_pages.concat(Array.from(page_get_queue)));    //resizeで後ろに置いたやつが消されるので、頭のほうに追加する
}

function page_get_queue_resize() {
    if (page_get_queue.size > PAGE_GET_QUEUE_REDUCE_NUMBER) {
        page_get_queue = new Set(Array.from(page_get_queue).filter(page => await(page.text_content).length == 0));
        page_get_queue = new Set(Array.from(page_get_queue).slice(0, PAGE_GET_QUEUE_REDUCE_NUMBER / 2));
    }
}

function page_get_queue_sort() {
    const page_score_by_page = new Map();
    for (page of page_get_queue) {
        page_score_by_page.set(page, page_score(page));
    }
    page_get_queue = new Set(Array.from(page_get_queue).sort((a, b) => page_score_by_page.get(b) - page_score_by_page.get(a)));
}

async function 関連ページに表示されてるやつの中から情報持ってない奴はサイトにアクセスして情報とってくる_関数内で(sortedPages) {
    const pages_contents_getting = [];
    for (page of sortedPages) {
        if (pages_contents_getting.length > PAGE_CONTENTS_GET_SIZE) { break }
        if (await page.text_content.constructor == String && await (page.text_content).length == 0) {
            pages_contents_getting.push(page);
        }
    }
    for (const page of pages_contents_getting) {
        const pages_got = await Page_get.createPageAndLinkedPagesFromUrl(page.url).catch(e => {
            console.error(e)
            return null;
        });
        if (pages_got == null) { continue };
        for (const page_got of pages_got) {
            page_got.isBookmarked = false;
            page_register(page_got);
        }
    }
}

function page_score(page) {
    if (page.tokens.length == 0) { return Number.MIN_SAFE_INTEGER / 2 }
    const uniqueness = page.token_objects
        .map(token_object => token_object.weight * Math.pow(pagesByToken.size_get(token_object.string) + 1, -2))
        .reduce((a, b) => a + b) / page.tokens.length;
    const score = uniqueness + 0.001 * page.isBookmarked;
    console.assert(score);
    return score;
}

/**
 * currentPageとクエリページ？
 * なんか名前つけたい
 * displayingPageと、targetPageかな
 */
async function pages_scores_by_url(targetPage, urlSet, urlSetList) {
    const page_score_element_by_url = {};
    for (url of urlSet) {
        page_score_element_by_url[url] = {}; 
    }

    for (url of urlSet) {
        page_score_element_by_url[url].uniqueness = 0;
    }

    const token_objects_target = targetPage.token_objects.filter(token_object => token_object.string.length > 1); 
    for (token_object of token_objects_target) {
        if(!pagesByToken.has(token_object.string)) { continue }
        const urlset_tmp = urls_get_by_token(token_object.string);
        const size = urlset_tmp.size + 1;
        const uniqueness = 1 / ((size + 1)*(size + 1));
        for (url of urlset_tmp) {
            if(!urlSet.has(url)){ continue }
            const weight = token_object.weight;
            page_score_element_by_url[url].uniqueness += weight * uniqueness;
        }
    }



    for (url of urlSet) {
        page_score_element_by_url[url].score_alone = page_score(page);
    }

    const uniquenessArray = Object.values(page_score_element_by_url).map(pageScoreElement => pageScoreElement.uniqueness);
    const maxUniqueness = Math.max(...uniquenessArray);
    const minUniqueness = Math.min(...uniquenessArray);


    let score_alone_max = Number.MIN_SAFE_INTEGER;
    let score_alone_min = Number.MAX_SAFE_INTEGER;
    for (score_elem of Object.values(page_score_element_by_url)) {
        if (score_alone_max < score_elem.score_alone) { score_alone_max = score_elem.score_alone }
        if (score_alone_min > score_elem.score_alone) { score_alone_min = score_elem.score_alone }
    }

    const scoreByUrl = {};
    const tabs = await browser.tabs.query({});
    console.assert(tabs.length > 0, tabs);
    for (let url of urlSet) {
        const page = pageByUrl.get(url);
        if (!page) { throw `page is ${page}, url i ${url}` };
        const bookmarkedScore = page.isBookmarked ? 1 : 0;
        const onTabScore = url_is_on_tab(url, tabs) ? 1 : 0;
        const normaledUniqueness = (page_score_element_by_url[url].uniqueness - minUniqueness) / (maxUniqueness - minUniqueness + 0.0000000000001);
        const score_alone_normaled = (page_score_element_by_url[url].score_alone - score_alone_min) / (score_alone_max - score_alone_min + 0.0000000000001);
        scoreByUrl[url] = normaledUniqueness + score_alone_normaled - 0.05 * bookmarkedScore + 0.00001 * onTabScore;
    }
    return scoreByUrl;
}

function url_is_on_tab(url, tabs) {
    if (typeof url != "string") {
        return false;
    }
    return tabs.map(tab => tab.url).includes(url);
}


function text_complexity_calc(text) {
    if (text.length == 0) {
        return 0;
    }
    const textComplexity = Array.from(text).map(a=>a.charCodeAt()).reduce((a,b)=>a+b);
    return textComplexity
}

function urlset_related_to_page(targetPage) {
    const urlSet = new Set();
    for (token of targetPage.tokens) {
        for (page of pagesByToken.get(token)) {
            urlSet.add(page.url);
        }
    }
    for (url of urlSet) {
        console.assert(pageByUrl.get(url), { url: url, pageByUrl: pageByUrl, targetPage: targetPage });
    }
    return urlSet;
}

function page_is_exist(url) {
    if (pageByUrl.get(url)) {
        return true;
    }
    return false;
}

function array_and(array1, array2) {
    return array1.filter(it => array2.includes(it));
}
Test.test_配列のANDが取れること = function () {
    const a = ["aa", "bb", "cc"];
    const b = ["bb", "cc", "dd"];
    console.assert(JSON.stringify(array_and(a, b)) == JSON.stringify(["bb", "cc"]), array_and(a, b));
}

async function tokens_calc(text) {
    if (!text) { return [] }

    const minComplexity = text_complexity_calc("zz");
    let tokens = (await tokenizer.tokenize(text))
        .map(s => s.replace(/\s/g, ""))
        .filter(s => s.length > 1)
        .map(s => s.toLowerCase());
    tokens = Array.from(new Set(tokens))
        .sort((s1, s2) => s1.length < s2.length);

    Test.assert(tokens, tokens);
    return tokens;
}
Test.test_テキストを分かち書きしてトークンが取り出せること = async function () {
    const text = "このフレームワークでは、自社が置かれた状況をCustomer（顧客）、Competitor（競合）、Company（自社）の観点から情報を整理し、顧客に対する相対的な競合優位性を検証します。";
    const tokens = await tokens_calc(text);
    console.assert(JSON.stringify(tokens) == JSON.stringify(["competitor", "customer", "フレームワーク", "company", "に対する", "この", "自社", "置か", "状況", "顧客", "競合", "観点", "から", "情報", "整理", "相対", "優位", "検証", "ます"]), tokens);
}


function uri_is_decodable(text) {
    try {
        decodeURIComponent(text);
        return true;
    } catch (error) {
        return false;
    }
}
Test.test_URIをでコードできること = function () {
    console.assert(!uri_is_decodable("https://scrapbox.io/t-Impression/search/page?q=%s"));
    console.assert(uri_is_decodable("https://scrapbox.io/t-Impression/search/page"));
}

async function tabs() {
    return await browser.tabs.query({});
}
Test.test_URLがタブとして表示されているかを識別できること = function () {
    (async () => {
        const tabs_ = await tabs();
        console.assert(url_is_on_tab(tabs_[0].url, tabs_) == true, tabs_[0].url);
        console.assert(url_is_on_tab("https://www.abc.com/", tabs_) == false);
        console.assert(url_is_on_tab(undefined, tabs_) == false);
        console.assert(url_is_on_tab(true, tabs_) == false);
        console.assert(url_is_on_tab(false, tabs_) == false);
        console.assert(url_is_on_tab(null, tabs_) == false);
    })();
}

/**
 * ブックマークからページオブジェクトを生成して、それを検索対象に追加する
 */
async function pages_create_from_bookmarks_without_network() {
    debugLog("createPagesFromBookmarksWithoutNetwork...")
    const pages = await bookmark_page_list();
    debugLog("pages from bookmark", pages);
    for (page of pages.filter(p => !page_is_exist(p))) {
        await page_register(page);
    }
    debugLog("pagesByToken", pagesByToken);
    debugLog("...createPagesFromBookmarksWithoutNetwork");
}

async function bookmark_page_list() {
    const bookmarks = (await bookmark_array())
        .filter(b => b.title)
        .filter(b => b.url)
        .filter(b => uri_is_decodable(b.url));
    const pages = [];
    for (b of bookmarks) {
        const tokens = (await tokens_calc(b.title)).concat(tokens_from_url(b.url));
        pages.push(new Page(b.url, tokens, "", b.title, true, null));
    }
    return pages;
}
Test.test_ブックマークからページオブジェクトを作って配列で返せること = function () {
    (async () => {
        const bookmarks = await browser.bookmarks.getRecent(1);
        const pages = await bookmark_page_list();
        console.assert(pages.find(page => page.url == bookmarks[0].url) != undefined, { pages: pages, bookmark: bookmarks[0] });
    })();
}

async function bookmark_urlset() {
    const urls = (await bookmark_array())
        .map(b => b.url)
        .filter(url => url)
        .filter(url => url.match(/^https?:\/\//g))
    return new Set(urls);
}
Test.test_ブックマークされているURLの配列を返すこと = function () {
    (async () => {
        console.assert(await bookmark_urlset());
    })();
}

async function url_is_bookmarked(url) {
    if (!url || url.constructor != String) {
        return false;
    }

    const bookmarks = await browser.bookmarks.search({ url: url });
    return bookmarks.length > 0;
}
Test.test_ブックマークを検知するテスト = async function () {
    Test.assert(url_is_bookmarked("https://addons.mozilla.org/ja/developers/addons?sort=popular"));
}
Test.test_URLがブックマークされているか識別できること = function () {
    (async () => {
        const bookmarks = await browser.bookmarks.getRecent(1);
        Test.assert(await url_is_bookmarked(bookmarks[0].url) == true, bookmarks[0].url);
    })();
    (async () => {
        Test.assert(await url_is_bookmarked(undefined) == false);
    })();
    (async () => {
        Test.assert(await url_is_bookmarked(null) == false);
    })();
    (async () => {
        Test.assert(await url_is_bookmarked(true) == false);
    })();
    (async () => {
        Test.assert(await url_is_bookmarked(false) == false);
    })();
}

async function bookmark_array() {
    let bookmarks = [(await browser.bookmarks.getTree())[0]];
    console.assert(bookmarks);
    for (let i = 0; i < bookmarks.length; i++) {
        const bookmark = bookmarks[i];
        if (!(bookmark && bookmark.children)) {
            continue;
        }

        const children = bookmark.children.filter(child => child);
        if (children) {
            bookmarks = bookmarks.concat(children);
        }
    }
    return bookmarks;
}

Test.test_bookmark一覧取得のテスト = function () {
    (async () => {
        const bookmarks = await bookmark_array();
        console.assert(bookmarks.filter(bk => bk).length > 0, bookmarks);
    })();
}

class Token {
    constructor(string) {
        this.string = string;
        this.weight = 1.0;
    }
}


class Page {
    constructor(url = "", tokens, text_content = "", title = "", isBookmarked = false, tab = undefined, favicon_url = undefined) {
        console.assert(url.constructor == String, url);
        console.assert(text_content == null || text_content.constructor == String, text_content);
        console.assert(title.constructor == String, title);
        this.url = url;
        this.__tab = tab;
        this.title = title;
        this.token_objects = [];
        this.tokens = tokens;
        this.favicon_url = favicon_url;
        if (text_content != null) {
            this.text_content = text_content
        }
    }

    get isBookmarked() {
        return bookmarkedUrlSet.has(this.url);
    }

    get tokens() {
        return this.token_objects.map(token_object => token_object.string);
    }

    set tokens(text_array) {
        this.token_objects = [];
        for (const text of text_array) {
            let token_object = Page.token_object_by_text.get(text);
            if (!token_object) {
                token_object = new Token(text)
                Page.token_object_by_text.set(text, token_object);
            }
            this.token_objects.push(token_object);
        }
    }

    async save() {
        LocalStorage.saveItem(this.url, await this.clone_without_text_content());
    }

    async clone() {
        const page_clone = {
            url: this.url,
            title: this.title,
            tokens: this.tokens,
            text_content: await this.text_content,
            isBookmarked: this.isBookmarked,
            favicon_url: this.favicon_url
        };
        return page_clone;
    }

    clone_without_text_content() {
        const page_clone = {
            url: this.url,
            title: this.title,
            tokens: this.tokens,
            isBookmarked: this.isBookmarked,
            favicon_url: this.favicon_url
        };
        return page_clone;
    }

    static async load(url, bookmarkedUrlSet_, loaded = undefined) {
        if (!loaded) {
            loaded = await LocalStorage.loadItem(url);
        }
        if (
            loaded &&
            loaded.title != undefined && loaded.title.constructor == String &&
            loaded.tokens != undefined && loaded.tokens.constructor == Array
        ) {
            return new Page(url, loaded.tokens, null, loaded.title, bookmarkedUrlSet_.has(url), null, loaded.favicon_url);
        }

        return null;
    }

    key_storage() {
        return JSON.stringify({ type: "page", url: this.url });
    }

    get text_content() {
        return LocalStorage.loadItem(this.key_storage()).then(text => text ?? "");
    }

    set text_content(value) {
        Test.assert(value.constructor == String, value);
        return LocalStorage.saveItem(this.key_storage(), value).catch(e => {
            console.warn(e);
        });
    }

    async delete() {
        return await LocalStorage.delete(this.url);
    }
}
Page.token_object_by_text = new Map();

Test.test_ページをストレージから複製できること1 = async function () {
    const page = await Page.load("https://example.com", new Set(), { url: "https://example.com", tokens: [], text_content: "example", title: "example", isBookmarked: false });
    Test.assert(page, page);
}
Test.test_ページをストレージから複製できること2 = async function () {
    const page = await Page.load("https://example.com", new Set(), { url: "https://example.com", tokens: [], text_content: "example", title: "example", isBookmarked: false, favicon_url: "https://example.com/favicon.ico" });
    Test.assert(page, page);
}

async function page_innerText_save(page) {
    if (await page.text_content == "") { return }
    debugLog(page);
    return await LocalStorage.saveItem(page.url, await page.text_content).catch(e => {
        console.error(e);
        return "";
    });
}

async function page_innerText_load_by_url(url) {
    return await LocalStorage.loadItem(url);
}

async function pages_from_history(histories) {
    debugLog("createPagesFromHistory...");
    for (let history of histories) {
        if (url_is_exist(history.url)) { continue }
        const page = await toPageFromHistory(history);
        if (page_is_exist(page)) { continue }
        await page_register(page);
    }
    debugLog("...createPagesFromHistory");
}

function url_is_exist(url, pageByUrl_ = pageByUrl) {
    if (!url || url.constructor != String) { return false }
    if (pageByUrl_.has(url)) {
        return true;
    }
    return false
}
Test.test_URLと対応するページがあればtrueを返す = function () {
    const url = "https://example.com";
    const pageByUrl_ = new Map([[url, new Page(url, [], null, "example title", false, null, null)]]);
    Test.assert(url_is_exist(url, pageByUrl_));
}
Test.test_URLと対応するページがなければfalseを返す = function () {
    const url = "https://example.com";
    const pageByUrl_ = new Map([[url, new Page(url, [], null, "example title", false, null, null)]]);
    Test.assert(!url_is_exist("https://dont.exist.example.com", pageByUrl_));
}

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

async function toPageFromHistory(history) {
    const tokens = (await tokens_calc(history.title)).concat(tokens_from_url(history.url));
    return new Page(history.url, tokens, "", history.title, bookmarkedUrlSet.has(history.url), null);
}
Test.test_履歴からページオブジェクトが生成できること = async function () {
    sleep(10000).then(
        async () => {
            const history = (await history_array())[0];
            const page = await toPageFromHistory(history);
            console.assert(
                (await page.text_content).constructor == String &&
                page.url.constructor == String &&
                page.tab == null &&
                page.title.constructor == String &&
                page.tokens.constructor == Array &&
                page.isBookmarked.constructor == Boolean
                , page);
        }
    )
}

async function history_array() {
    let historyArray = await browser.history.search({ text: "", maxResults: HISTORY_MAX_LOAD, startTime: 0 });
    historyArray = historyArray.filter(history => history.visitCount > HISTORY_VISITCOUNT_THRESHOLD);
    debugLog(historyArray);
    return historyArray;
}
Test.test_履歴を配列で取得できること = function () {
    (async () => {
        const histories = await history_array();
        for (let history of histories) {
            console.assert(
                history.id != undefined &&
                history.lastVisitTime &&
                history.title != undefined &&
                history.url != undefined &&
                typeof history.visitCount == "number"
                , history);
            console.assert(
                history.id.constructor == String &&
                history.lastVisitTime.constructor == Number &&
                history.title.constructor == String &&
                history.url.constructor == String &&
                history.visitCount.constructor == Number
                , history);
        };
    })()
}

class Page_get {
    static async createPageAndLinkedPagesFromUrl(url) {
        const html = await Page_get._getHtml(url);
        const htmlElem = Page_get._parseHTML(html);

        const body = htmlElem.getElementsByTagName("body")[0];

        /*Scriptタグを削除。bodyタグ内にScriptタグがあると、JSがinnerTextに入り込む*/
        [...body.getElementsByTagName("script")].forEach(e => e.remove());

        const og_contents = Array.from(body.querySelectorAll("meta[content]")).map(og => og.content).join(" ");
        const innerText = body.innerText + og_contents;
        const titleElem = htmlElem.querySelector("title");
        const title = titleElem ? titleElem.innerText : "";
        const tokens = (await tokens_calc(title + "\n" + innerText)).concat(tokens_from_url(url));
        const bookmark = await url_is_bookmarked(url);
        const favicon_url = htmlElem.querySelector("link[rel~='icon']")?.href;
        const page = new Page(url, tokens, innerText, title, bookmark, null, favicon_url);

        let a_elem_array = Array.from(htmlElem.getElementsByTagName("a"))
            .filter(a =>
                a.href &&
                a.href.includes("http") &&
                a.innerText &&
                !a.classList.toString().includes("button") &&
                !a.id.includes("button") &&
                !a.href.includes("search"))
            .slice(0, 300);
        const pages_from_link = await Promise.all(a_elem_array.map(async a_elem => {
            const linkText = a_elem.innerText.replace(/\n|\s/g, " ");
            const tokens = (await tokens_calc(linkText)).concat(tokens_from_url(a_elem.href));
            return new Page(a_elem.href, tokens, "", linkText, null, null);
        }));
        return pages_from_link.concat(page);
    }

    static async createPageFromUrl(url) {
        const html = await Page_get._getHtml(url);
        const htmlElem = Page_get._parseHTML(html);
        const body = htmlElem.getElementsByTagName("body")[0];

        /*Scriptタグを削除。bodyタグ内にScriptタグがあると、JSがinnerTextに入り込む*/
        [...body.getElementsByTagName("script")].forEach(e => e.remove());

        const innerText = body.innerText
        const titleElem = htmlElem.getElementsByTagName("title")[0];
        const title = titleElem ? titleElem.innerText : "";
        const tokens = (await tokens_calc(title + "\n" + innerText)).concat(tokens_from_url(url));
        const page = new Page(url, tokens, innerText, title, null, null);
        return page
    }

    static _parseHTML(htmlString) {
        /**
         * https://stackoverflow.com/questions/10585029/parse-an-html-string-with-js
         */
        var parser = new DOMParser();
        var htmlDoc = parser.parseFromString(htmlString, 'text/html');
        if (!htmlDoc) { throw `missed parsing html : ${htmlString}` }
        return htmlDoc;
    }

    static _getHtml(url) {
        return new Promise(function (resolve, reject) {
            let xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            xhr.timeout = XHR_TIMEOUT_MS;
            xhr.onload = function () {
                if (this.status >= 200 && this.status < 300) {
                    resolve(xhr.response);
                } else {
                    reject({
                        url: url,
                        status: this.status,
                        statusText: xhr.statusText
                    });
                }
            };
            xhr.onerror = function () {
                reject({
                    url: url,
                    status: this.status,
                    statusText: xhr.statusText
                });
            };
            xhr.send();
        });
    }
}
Test.test_URLからページオブジェクトを生成できること = function () {
    (async () => {
        const url = "http://example.com/";
        const page = await Page_get.createPageFromUrl(url);
        console.assert(page.title == "Example Domain", page);
        console.assert((await page.text_content).includes("This domain is for use in illustrative examples in documents."), page);
        console.assert(page.tokens.includes("illustrative"), page);
        console.assert(page.url == url, page);
    })();
}

Test.test_body内のscriptは消すこと = function () {
    (async () => {
        const url = "https://www.youtube.com/watch?v=lXOyo_INVfk";
        const page = await Page_get.createPageFromUrl(url);
        Test.assert(!(await page.text_content).includes("{"), page);
    })();
}

Test.run();
