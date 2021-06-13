let debug = true;
let test = false;
debugLog = debug ? console.log.bind(null, 'backgrount.js DEBUG:') : () => {};
testLog = test ? console.log.bind(null, 'backgrount.js TEST:') : () => {};

const SAVE_DELAY = 60 * 1000;
const PAGE_GET_INTERVAL_MS = 4 * 1000;
const XHR_TIMEOUT_MS = 3 * 1000;
const PAGE_DISPLAY_LENGTH = 20;
const PAGE_NUMBER_BY_TOKEN_LIMIT = 40;
const HISTORY_MAX_LOAD = 5000;
const PAGE_GET_QUEUE_REDUCE_NUMBER = 1000;
const HISTORY_VISITCOUNT_THRESHOLD = 0;
const PAGE_FREE_INTERVAL_MS = 10 * 1000;
const PAGE_NUMBER_LIMIT = 100000;
const PAGE_FREE_SELECT_NUMBER = 10;
const HISTORY_LOAD = true;
const BOOKMARK_LOAD = true;
const UNIQUNESS_EXPORNENT = -0.5;
const TOKENS_SCORE_LIMIT = 0.01;
const TOKEN_REWARD_ON_RECOMMEND = 0.001;
const TOKEN_REWARD_ON_REGISTER = 0.01;
const TOKEN_REWARD_ON_REGISTER_FROM_BOOKMARK = 0.1;
const TOKEN_REWARD_ON_IGNORED = -0.1;
const TOKEN_REWARD_ON_DELETE = -1.0;
const TOKEN_REWARD_ON_TAB_DELETE = -0.1;
const TOKEN_REWARD_ON_SELECT = 1.0;
const TOKEN_REWARD_ON_RELOAD = -2;
const SAME_TOKEN_SCORE_MULTIPLIER = 2.0;

class PageByUrl {
    constructor() {
        this.map = new Map();
    }
    get(url) {
        return this.map.get(url);
    }
    set(url, page) {
        return this.map.set(url, page);
    }
    delete(url) {
        return this.map.delete(url);
    }
    has(url) {
        return this.map.has(url);
    }
    get size() {
        return this.map.size;
    }
    values() {
        return this.map.values();
    }
}

class PagesByToken {
    constructor() {
        this.pageByUrl = new PageByUrl();
        this.map = new Map();
        this.store = localforage.createInstance({ name: 'PagesByToken' });
    }
    async load_async() {
        const map = await this.store.getItem('map');
        if (map) {
            this.map = map;
        }

        for (const url_set of this.map.values()) {
            for (const url of url_set) {
                if (this.pageByUrl.has(url)) {
                    continue;
                }

                const page = await Page.load(url);
                if (!page) {
                    url_set.delete(url);
                    continue;
                }

                this.pageByUrl.set(url, page);
            }
        }
    }
    async save_async() {
        await this.store.setItem('map', this.map);
    }

    get_pages(key) {
        const urls = this.get_urls(key);
        const pages = new Set();
        for (const url of urls) {
            const page = this.pageByUrl.get(url);
            pages.add(page);
        }
        return pages;
    }
    get_urls(key) {
        const urls = this.map.get(key) ?? new Set();
        if (urls.size == 0) {
            this.map.set(key, urls);
        }
        return urls;
    }
    url_delete_from_token(token, url) {
        const url_set = this.map.get(token);
        url_set?.delete(url);
        this.map.set(token, url_set);
        this.save_with_timeout_async(10 * 1000);
    }
    size_get(key) {
        const values = this.map.get(key);
        if (!values) {
            return 0;
        }
        return values.size;
    }
    add(key, page) {
        if (page) {
            this.get_urls(key).add(page.url);
        }
        this.save_with_timeout_async(10 * 1000);
    }
    async save_with_timeout_async(timeout_ms) {
        if (!this.saving) {
            this.saving = true;
            await this.save_async().finally(() => {
                setTimeout(() => {
                    this.saving = false;
                }, timeout_ms);
            });
        }
    }
    *values() {
        for (const url of this.get_urls()) {
            yield this.pageByUrl.get(url);
        }
    }
    delete(key) {
        return this.map.delete(key);
    }
    has(key) {
        return this.map.has(key);
    }
}

class Token_Object_By_Text {
    constructor() {
        this.map = new Map();
        this.SAVE_DELAY_MS = 5 * 1000;
        this.store = localforage.createInstance({
            name: 'Token_Object_By_Text',
        });
        this.KEY_STORAGE = 'token_object_by_text';
    }

    save_with_timeout() {
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            this.save_async();
        }, this.SAVE_DELAY_MS);
    }

    async save_async() {
        await this.store.setItem(this.KEY_STORAGE, this.map);
    }

    async load_async() {
        const loaded = await this.store.getItem(this.KEY_STORAGE);
        if (loaded) {
            this.map = loaded;
        }
    }

    set(key, value) {
        this.map.set(key, value);
        this.save_with_timeout();
    }

    get(key) {
        return this.map.get(key);
    }
}

class Token {
    constructor(string) {
        this.string = string;
        this.weight = 1.0;
    }
}

class Page {
    constructor(url = '', tokens, text_content = '', title = '', isBookmarked = false, tab = undefined, favicon_url = undefined) {
        console.assert(url.constructor == String, url);
        console.assert(text_content == null || text_content.constructor == String, text_content);
        console.assert(title.constructor == String, title);
        this.url = url;

        if (title) {
            this.title = title;
        }
        this.token_objects = new Set();
        this.tokens = new Set(tokens);
        if (text_content) {
            this.text_content = text_content;
        }
    }

    async async() {
        return await Promise.all([this.title_promise, this.text_content]);
    }

    get title_key() {
        return `{url: ${this.url}, title = true}`;
    }

    get title() {
        return Page.title_store.getItem(this.title_key).then((text) => text ?? '');
    }

    set title(text) {
        Test.assert(text.constructor == String, text);
        this.title_promise = Page.title_store.setItem(this.title_key, text).catch((e) => {
            console.warn(e);
        });
    }

    get isBookmarked() {
        return web_prowler.bookmarkedUrlSet.has(this.url);
    }

    get tokens() {
        const token_set = new Set([...this.token_objects].map((token_object) => token_object.string));
        return token_set;
    }

    set tokens(token_set) {
        this.token_objects = new Set();
        for (const text of token_set) {
            let token_object = web_prowler.token_object_by_text.get(text);
            if (!token_object) {
                token_object = new Token(text);
                web_prowler.token_object_by_text.set(text, token_object);
            }
            this.token_objects.add(token_object);
        }
    }

    async save() {
        Page.store.setItem(this.url, await this.clone_without_data_on_storage());
    }

    async clone() {
        const page_clone = {
            url: this.url,
            title: await this.title,
            tokens: this.tokens,
            text_content: await this.text_content,
            isBookmarked: this.isBookmarked,
            favicon_url: this.favicon_url,
        };
        return page_clone;
    }

    clone_without_data_on_storage() {
        const page_clone = {
            url: this.url,
            tokens: this.tokens,
            isBookmarked: this.isBookmarked,
            favicon_url: this.favicon_url,
        };
        return page_clone;
    }

    static async load(url) {
        const loaded = await Page.store.getItem(url);
        if (loaded && loaded.tokens != undefined && loaded.tokens.constructor == Set) {
            return new Page(url, loaded.tokens, loaded.text_content, loaded.title, null, null, null);
        }

        return null;
    }

    key_storage() {
        return JSON.stringify({ type: 'page', url: this.url });
    }

    get text_content() {
        return Page.text_content_store.getItem(this.key_storage()).then((text) => text ?? '');
    }

    set text_content(value) {
        Test.assert(value.constructor == String, value);
        this.text_content_promise = Page.text_content_store.setItem(this.key_storage(), value).catch((e) => {
            console.warn(e);
        });
    }

    async delete() {
        return await Page.store.removeItem(this.url);
    }
}
Page.store = localforage.createInstance({ name: 'Page' });
Page.text_content_store = localforage.createInstance({ name: 'Page_text_content' });
Page.title_store = localforage.createInstance({ name: 'Page_title' });

class Page_get {
    static async createPageAndLinkedPagesFromUrl(url) {
        const html = await Page_get._getHtml(url);
        const htmlElem = Page_get._parseHTML(html);

        const body = htmlElem.getElementsByTagName('body')[0];
        if (!body) {
            return;
        }

        /*Scriptタグを削除。bodyタグ内にScriptタグがあると、JSがinnerTextに入り込む*/
        [...body.getElementsByTagName('script')].forEach((e) => e.remove());
        [...body.getElementsByTagName('link')].forEach((e) => e.remove());
        [...body.getElementsByTagName('style')].forEach((e) => e.remove());

        const og_contents = Array.from(body.querySelectorAll('meta[content]'))
            .map((og) => og.content)
            .join(' ');
        const innerText = body.innerText + og_contents;
        const titleElem = htmlElem.querySelector('title');
        if (!titleElem) {
            return;
        }
        const title = titleElem.innerText;
        const tokens = (await web_prowler.tokens_calc(title + '\n' + innerText)).concat(web_prowler.tokens_from_url(url));
        const bookmark = await web_prowler.url_is_bookmarked(url);
        const favicon_url = htmlElem.querySelector("link[rel~='icon']")?.href;
        const page = new Page(url, tokens, innerText, title, bookmark, null, favicon_url);

        let a_elem_array = Array.from(htmlElem.getElementsByTagName('a'))
            .filter(
                (a) =>
                    a.href &&
                    a.href.includes('http') &&
                    a.innerText &&
                    !a.classList.toString().includes('button') &&
                    !a.id.includes('button') &&
                    !a.href.includes('search')
            )
            .slice(0, 300);
        const pages_from_link = (
            await Promise.all(
                a_elem_array.map(async (a_elem) => {
                    const linkText = a_elem.innerText.replace(/\n|\s/g, ' ');
                    if (linkText == '') {
                        return;
                    }
                    const tokens = (await web_prowler.tokens_calc(linkText)).concat(web_prowler.tokens_from_url(a_elem.href));
                    if (web_prowler.tokens_score_average(tokens) < TOKENS_SCORE_LIMIT) {
                        return;
                    }
                    return new Page(a_elem.href, tokens, '', linkText, null, null);
                })
            )
        ).filter((page) => page);
        return pages_from_link.concat(page);
    }

    static async createPageFromUrl(url) {
        const html = await Page_get._getHtml(url);
        const htmlElem = Page_get._parseHTML(html);
        const body = htmlElem.getElementsByTagName('body')[0];

        /*Scriptタグを削除。bodyタグ内にScriptタグがあると、JSがinnerTextに入り込む*/
        [...body.getElementsByTagName('script')].forEach((e) => e.remove());

        const innerText = body.innerText;
        const titleElem = htmlElem.getElementsByTagName('title')[0];
        const title = titleElem ? titleElem.innerText : '';
        const tokens = (await web_prowler.tokens_calc(title + '\n' + innerText)).concat(web_prowler.tokens_from_url(url));
        const page = new Page(url, tokens, innerText, title, null, null);
        return page;
    }

    static _parseHTML(htmlString) {
        /**
         * https://stackoverflow.com/questions/10585029/parse-an-html-string-with-js
         */
        var htmlDoc = Page_get.parser.parseFromString(htmlString, 'text/html');
        if (!htmlDoc) {
            throw `missed parsing html : ${htmlString}`;
        }
        return htmlDoc;
    }

    static async _getHtml(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, XHR_TIMEOUT_MS);
        const response = await fetch(url, { signal: controller.signal });
        const text = await response.text();
        clearTimeout(timeout);
        return text;
    }
}
Page_get.parser = new DOMParser();

class WebProwler {
    constructor() {
        this.tokenizer = new Tokenizer();
        this.pagesByToken = new PagesByToken();
        this.bookmarkedUrlSet = new Set();
        this.history_set = new Set();
        this.tokens_ng = new Set();
        this.token_object_by_text = new Token_Object_By_Text();
        this.page_get_queue = new Set();
    }

    async init() {
        debugLog('init...');

        this.bookmarkedUrlSet = await this.bookmark_urlset();
        this.historie_set = new Set(await this.history_array());
        await this.token_object_by_text.load_async();
        await this.load_async();
        if (this.pagesByToken.pageByUrl.size == 0) {
            await this.load_from_page_load_async();
            debugLog('load_from_page_load_async', this.pagesByToken);
        }
        if (this.pagesByToken.pageByUrl.size == 0) {
            if (BOOKMARK_LOAD) {
                await this.pages_create_from_bookmarks_without_network();
            }
            if (HISTORY_LOAD) {
                await this.pages_from_history(this.historie_set);
            }
        }

        browser.runtime.onMessage.addListener((message, sender, sendResponse) => this.recommend_on_message(message, sender, sendResponse));
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => this.page_register_on_message(message, sender, sendResponse));
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => this.pages_register_on_message(message, sender, sendResponse));
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => this.page_delete_on_message(message, sender, sendResponse));
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => this.recommend_reload_on_message(message, sender, sendResponse));
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => this.recommend_selected_on_message(message, sender, sendResponse));
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => this.bookmark_search_switch(message, sender, sendResponse));
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => debugLog('message', message));

        browser.bookmarks.onCreated.addListener(() => this.bookmark_urlset_reset);
        browser.bookmarks.onRemoved.addListener(() => this.bookmark_urlset_reset);
        browser.bookmarks.onChanged.addListener(() => this.bookmark_urlset_reset);

        browser.history.onVisited.addListener((histry_item) => {
            this.historie_set.add(histry_item.id);
        });

        browser.tabs.onRemoved.addListener(() => this.token_learn_on_tab_delete);

        setInterval(() => this.prowl(this.page_get_queue), PAGE_GET_INTERVAL_MS);

        setInterval(async () => {
            const pages_number = this.pagesByToken.pageByUrl.size;
            if (pages_number <= PAGE_NUMBER_LIMIT) {
                return;
            }
            if (pages_number <= PAGE_FREE_SELECT_NUMBER) {
                return;
            }
            const page_free_select_number = (pages_number - PAGE_NUMBER_LIMIT) * 3;
            this.pages_free(page_free_select_number, pages_number - PAGE_NUMBER_LIMIT);
            console.assert(this.pagesByToken.pageByUrl.size == PAGE_NUMBER_LIMIT, this.pagesByToken.pageByUrl.size);
        }, PAGE_FREE_INTERVAL_MS);
        debugLog('...init');
    }

    async recommend_reload_on_message(message, sender, sendResponse = () => {}) {
        if (message.type != 'recommend_reload') {
            return;
        }

        for (const page of this.pages_sorted) {
            if (!page) {
                continue;
            }
            const token_object_set = new Set();
            for (const token_object of page.token_objects) {
                token_object_set.add(token_object);
            }
            this.tokens_weight_learn(token_object_set, TOKEN_REWARD_ON_RELOAD);
        }
        await this.recommend_async(this.page_last_recommend_target);
        sendResponse({});
        return true;
    }

    tokens_weight_learn(token_objects, reward) {
        const LEARNING_ALPHA = 0.1;
        for (const token_object of token_objects) {
            const weight_delta = -1.0 * LEARNING_ALPHA * reward * Math.pow(this.pagesByToken.size_get(token_object.string) + 1, UNIQUNESS_EXPORNENT);
            token_object.weight -= weight_delta;
        }
    }

    async bookmark_search_switch(message) {
        if (message.type != 'bookmark_search_switch') {
            return;
        }
        this.bookmark_search = message.enable;
        await this.recommend_async(this.page_last_recommend_target);
        sendResponse({});
        return true;
    }

    async token_learn_on_tab_delete(tabId, removeInfo) {
        const tab = (await tabs()).find((tab) => tab.id == tabId);
        if (!tab) {
            return;
        }
        const url = tab.url;
        console.assert(url, url);
        const page = this.pagesByToken.pageByUrl.get(url);
        if (!page) {
            return;
        }
        this.page_tokens_weight_learn(page, TOKEN_REWARD_ON_TAB_DELETE);
    }

    async recommend_selected_on_message(message, sender) {
        if (!message.recommend_selected) {
            return;
        }
        debugLog('message', message);
        const page_selected = this.pagesByToken.pageByUrl.get(message.page.url);
        this.page_tokens_weight_learn(page_selected, TOKEN_REWARD_ON_SELECT);
    }

    page_tokens_weight_learn(page, reward) {
        const LEARNING_ALPHA = 0.1;
        for (const token_object of page.token_objects) {
            const weight_delta = -1.0 * LEARNING_ALPHA * reward * Math.pow(this.pagesByToken.size_get(token_object.string) + 1, UNIQUNESS_EXPORNENT);
            token_object.weight -= weight_delta;
        }
    }

    async bookmark_urlset_reset() {
        bookmarkedUrlSet = await bookmark_urlset();
    }

    async prowl(page_get_queue) {
        if (!page_get_queue) {
            console.trace(page_get_queue);
        }
        const page = page_get_queue.values().next().value;
        page_get_queue.delete(page);
        if (!page) {
            return;
        }
        const extension = this.getExtension(page.url).toLowerCase();
        if (['mp4', 'jpeg', 'png', 'jpg', 'gif', 'mp3'].includes(extension)) {
            return;
        }
        if ((await page.text_content.length) > 0) {
            return;
        }

        const pages_got = await Page_get.createPageAndLinkedPagesFromUrl(page.url).catch((e) => {
            console.warn(`createPageAndLinkedPagesFromUrl  url:${page.url}, error:`, e);
            return null;
        });
        if (pages_got == null) {
            return;
        }

        for (const page_got of pages_got) {
            this.page_register(page_got);
        }

        debugLog('pages_got', pages_got);
    }

    //////////////////////////////////////////////////////////////////////
    // Get file extension.
    // @param url string: The target URL.
    //////////////////////////////////////////////////////////////////////
    getExtension(url) {
        return url.split(/#|\?/)[0].split('.').pop().trim();
    }

    pages_free(select_number, free_number = 1) {
        if (this.pagesByToken.pageByUrl.size < select_number) {
            return;
        }
        const pages_base = Array.from(this.pagesByToken.pageByUrl.values());
        const page_set = new Set();
        for (let i = 0; i < pages_base.length; i++) {
            const page_random_index = this.index_random(pages_base);
            let page = null;
            for (let j = 0; j <= pages_base.length; j++) {
                const index = (page_random_index + j) % pages_base.length;
                if (!page_set.has(pages_base[index])) {
                    page = pages_base[index];
                    break;
                }
            }
            console.assert(page);

            page_set.add(page);

            if (page_set.size >= select_number) {
                break;
            }
        }

        const page_score_by_page = new Map();
        for (const page of page_set) {
            page_score_by_page.set(page, this.page_score(page));
        }

        const pages_sorted = [...page_set].sort((p1, p2) => page_score_by_page.get(p1) - page_score_by_page.get(p2));

        for (let i = 0; i < free_number; i++) {
            this.page_delete(pages_sorted[i]);
        }
    }

    index_random(array) {
        return this.randInt(0, array.length - 1);
    }

    randInt(min, max) {
        var range = max - min;
        var rand = Math.floor(Math.random() * (range + 1));
        return min + rand;
    }

    array_choice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    async load_async() {
        await this.pagesByToken.load_async();
        debugLog('pagesByToken.load_async', this.pagesByToken);
    }

    async load_from_page_load_async() {
        const keys = await Page.store.keys();
        const promises = keys.map(async (key) => {
            const url = key;
            const page = await Page.load(url, this.bookmarkedUrlSet);
            if (page) {
                page.tokens.forEach((token) => {
                    this.pagesByToken.add(token, page);
                });
                this.pagesByToken.pageByUrl.set(page.url, page);
            }
        });
        await Promise.all(promises);
    }

    async page_register(page, page_save = true) {
        console.assert(page != undefined, page);
        console.assert(page.constructor == Page, page);

        const page_old = this.pagesByToken.pageByUrl.get(page.url);
        if (page_old) {
            for (const token of page_old.tokens) {
                this.pagesByToken.url_delete_from_token(token, page_old.url);
                if (this.pagesByToken.size_get(token) == 0) {
                    this.pagesByToken.delete(token);
                }
            }
        }

        page.tokens.forEach((token) => {
            this.pagesByToken.add(token, page);
        });
        this.pagesByToken.pageByUrl.set(page.url, page);
        page.save();
    }

    page_delete(page_) {
        const page = this.pagesByToken.pageByUrl.get(page_.url);
        for (const pages of this.pagesByToken.values()) {
            pages.delete(page);
            pages.delete(page_);
        }
        this.pagesByToken.pageByUrl.delete(page.url);
        page.delete();

        console.assert(this.pagesByToken.pageByUrl.get(page.url) != page);
        console.assert(!Array.from(page.tokens).find((token) => this.pagesByToken.get_pages(token).has(page)), page);
    }

    async recommend_on_message(message, sender, sendResponse = () => {}) {
        if (message.type != 'recommend') {
            return;
        }
        console.assert(typeof message.page.text_request == 'string', message);

        debugLog('message', message);

        const title = '';
        const text_content = message.page.text_request;
        const tokens = await this.tokens_calc(title + '\n' + text_content);
        const token_objects = new Set();
        for (const token of tokens) {
            let token_object = this.token_object_by_text.get(token);
            if (!token_object) {
                token_object = new Token(token);
                this.token_object_by_text.set(token, token_object);
            }
            token_objects.add(token_object);
        }
        const isBookmarked = this.bookmarkedUrlSet.has(message.page.url);
        this.page_last_recommend_target = {
            url: message.page.url,
            tokens: tokens,
            token_objects: token_objects,
            text_content: text_content,
            title: title,
            isBookmarked: isBookmarked,
        };

        await this.recommend_async(this.page_last_recommend_target);

        sendResponse({});

        return true;
    }

    async recommend_async(page_target) {
        debugLog('url', page_target.url);

        const page_by_url = new Map();
        for (const token of page_target.tokens) {
            const pages = this.pagesByToken.get_pages(token);
            for (const page of pages) {
                page_by_url.set(page.url, page);
            }
        }

        const tokens_sorted = await this.tokens_sorted_calc(page_target.token_objects);
        debugLog('sortedTokens', tokens_sorted);

        this.pages_sorted = await this.pages_sorted_calc(page_target, tokens_sorted, page_by_url);
        debugLog('sortedPages', this.pages_sorted);

        this.page_related_display(this.pages_sorted, tokens_sorted);

        this.関連ページに表示されてるやつの中から情報持ってない奴はサイトにアクセスして情報とってくる(this.pages_sorted);

        await this.page_get_queue_resize_async();
        this.page_get_queue_sort();

        this.pages_tokens_weight_reduce(this.pages_sorted);

        this.page_tokens_weight_learn(this.page_last_recommend_target, TOKEN_REWARD_ON_RECOMMEND);
    }

    pages_tokens_weight_reduce(pages) {
        for (const page of pages) {
            this.page_tokens_weight_learn(page, TOKEN_REWARD_ON_IGNORED);
        }
    }

    async page_register_on_message(message, sender) {
        if (message.type != 'register') {
            return;
        }
        console.assert(typeof message.page.text_content == 'string', message);
        debugLog('message', message);

        const title = message.page.title;
        const text_content = message.page.text_content;
        const tokens = (await this.tokens_calc(title + '\n' + text_content)).concat(this.tokens_from_url(message.page.url));
        const isBookmarked = await this.url_is_bookmarked(message.page.url);
        const favicon_url = message.page.favicon_url;
        const url = message.page.url;

        if (title == '') {
            return;
        }
        const page = new Page(message.page.url, tokens, text_content, title, isBookmarked, null, favicon_url);
        if (this.pagesByToken.pageByUrl.has(url)) {
            const text_content_old = await this.pagesByToken.pageByUrl.get(page.url).text_content;
            if (text_content_old == text_content) {
                return;
            }
            if (text_content_old != '' && text_content == '') {
                return;
            }
        }
        if (this.tokens_score_average(tokens) < TOKENS_SCORE_LIMIT) {
            return;
        }

        await page.async();
    }

    tokens_from_url(url) {
        return this.domain_from_url(url).split('.');
    }

    domain_from_url(url) {
        const match = url.match(/^https?:\/{2,}(.*?)(?:\/|\?|#|$)/);
        if (match) {
            return match[1];
        }
        return '';
    }

    pages_delete_on_message(message, sender) {
        if (!message.pages_delete) {
            return;
        }
        const urls = message.pages.map((page) => page.url);
        for (const url of urls) {
            const page = this.pagesByToken.pageByUrl.get(url);
            if (!page) {
                continue;
            }
            this.page_tokens_weight_learn(page, TOKEN_REWARD_ON_DELETE);
            this.page_delete(page);
        }
        console.assert(urls.filter((url) => this.pagesByToken.pageByUrl.get(url)).length == 0, message);
    }

    page_delete_on_message(message, sender) {
        if (!message.page_delete) {
            return;
        }
        const page = this.pagesByToken.pageByUrl.get(message.page.url);
        this.page_delete(page);
        this.page_tokens_weight_learn(page, TOKEN_REWARD_ON_DELETE);
        console.assert(!this.pagesByToken.pageByUrl.get(page.url));
    }

    async pages_register_on_message(message, sender) {
        debugLog('pages_register_on_message...');

        for (const page_in_message of message.pages) {
            const title = page_in_message.title;
            const text_content = page_in_message.text_content;
            const url = page_in_message.url;
            const tokens = (await this.tokens_calc(title + '\n' + text_content)).concat(this.tokens_from_url(url));
            const isBookmarked = this.bookmarkedUrlSet.has(page_in_message.url);

            if (title == '') {
                return;
            }
            if (this.pagesByToken.pageByUrl.has(url)) {
                const text_content_old = await this.pagesByToken.pageByUrl.get(url).text_content;
                if (text_content_old == text_content) {
                    return;
                }
                if (text_content_old != '' && text_content == '') {
                    return;
                }
            }
            if (this.tokens_score_average(tokens) < TOKENS_SCORE_LIMIT) {
                return;
            }

            const page = new Page(url, tokens, text_content, title, isBookmarked, null);
            await page.async();
            await this.page_register(page);
            this.page_tokens_weight_learn(page, TOKEN_REWARD_ON_REGISTER);

            debugLog('...pages_register_on_message');
        }
    }

    urls_get_by_token(token) {
        const urls = this.pagesByToken.get_urls(token);
        return urls;
    }

    tokens_score_average(tokens) {
        let score_sum = 0;
        for (const token of tokens) {
            score_sum += this.token_score(token);
        }
        return score_sum / tokens.size;
    }

    async pages_sorted_calc(page_target, tokens_sorted, page_by_url) {
        const urlset_list = tokens_sorted.map((token) => this.urls_get_by_token(token));

        const urlset = new Set();
        urlset_list.forEach((tmpUrlSet) => {
            for (let url of tmpUrlSet) {
                if (this.bookmark_search) {
                    if (this.bookmarkedUrlSet.has(url)) {
                        urlset.add(url);
                    }
                } else {
                    urlset.add(url);
                }

                if (urlset.size > PAGE_DISPLAY_LENGTH * 2) {
                    return;
                }
            }
        });
        const pages_scores_by_url_ = await this.pages_scores_by_url(page_target, urlset, urlset_list).catch((e) => console.error(e));

        urlset.delete(page_target.url);

        const sortedPages = Array.from(urlset)
            .sort((url1, url2) => pages_scores_by_url_.get(url2) - pages_scores_by_url_.get(url1))
            .slice(0, PAGE_DISPLAY_LENGTH)
            .map((url) => page_by_url.get(url));

        console.assert(
            sortedPages.length <= 1 ||
                pages_scores_by_url_.get(sortedPages[0].url) >= pages_scores_by_url_.get(sortedPages[sortedPages.length - 1].url),
            sortedPages,
            pages_scores_by_url_
        );

        return sortedPages;
    }

    async tokens_sorted_calc(token_objects) {
        return Array.from(token_objects)
            .filter((token_object) => this.pagesByToken.size_get(token_object.string) > 1)
            .filter((token_object) => PAGE_NUMBER_BY_TOKEN_LIMIT > this.pagesByToken.size_get(token_object.string))
            .sort(
                (token_object1, token_object2) =>
                    Math.pow(this.pagesByToken.size_get(token_object1.string), UNIQUNESS_EXPORNENT) * token_object1.weight -
                    Math.pow(this.pagesByToken.size_get(token_object2.string), UNIQUNESS_EXPORNENT) * token_object2.weight
            )
            .reverse()
            .map((token_object) => token_object.string);
    }

    async page_related_display(sortedPages, sortedTokens) {
        const pages = await Promise.all(sortedPages.map(async (page) => await page.clone()));
        Test.assert(!pages.find((it) => !it.url), pages);
        const message = { sortedPages: pages, sortedTokens: sortedTokens, type: 'display_related_page' };
        debugLog('message', message);
        browser.runtime.sendMessage(message);
    }

    async 関連ページに表示されてるやつの中から情報持ってない奴はサイトにアクセスして情報とってくる(sortedPages) {
        const text_content_array = await Promise.all(sortedPages.map((page) => page.text_content));
        const _pages = sortedPages
            .filter((page, i) => text_content_array[i] == '')
            .slice()
            .reverse();
        this.page_get_queue = new Set(_pages.concat(Array.from(this.page_get_queue))); //resizeで後ろに置いたやつが消されるので、頭のほうに追加する
    }

    async page_get_queue_resize_async() {
        if (this.page_get_queue.size > PAGE_GET_QUEUE_REDUCE_NUMBER) {
            this.page_get_queue = new Set(Array.from(this.page_get_queue).slice(0, PAGE_GET_QUEUE_REDUCE_NUMBER / 2));
        }
    }

    page_get_queue_sort() {
        const page_score_by_page = new Map();
        for (const page of this.page_get_queue) {
            page_score_by_page.set(page, this.page_score(page));
        }
        this.page_get_queue = new Set(Array.from(this.page_get_queue).sort((a, b) => page_score_by_page.get(b) - page_score_by_page.get(a)));
    }

    async 関連ページに表示されてるやつの中から情報持ってない奴はサイトにアクセスして情報とってくる_関数内で(sortedPages) {
        const pages_contents_getting = [];
        for (const page of sortedPages) {
            if (pages_contents_getting.length > PAGE_CONTENTS_GET_SIZE) {
                break;
            }
            const text_content = await page.text_content;
            if (text_content.constructor == String && text_content.length == 0) {
                pages_contents_getting.push(page);
            }
        }
        for (const page of pages_contents_getting) {
            const pages_got = await Page_get.createPageAndLinkedPagesFromUrl(page.url).catch((e) => {
                console.error(e);
                return null;
            });
            if (pages_got == null) {
                continue;
            }
            for (const page_got of pages_got) {
                page_got.isBookmarked = false;
                page_register(page_got);
            }
        }
    }

    page_score(page) {
        if (page.tokens.size == 0) {
            return Number.MIN_SAFE_INTEGER / 2;
        }

        let uniqueness = 0;
        for (const token of page.tokens) {
            uniqueness += this.token_score(token);
        }
        uniqueness /= page.tokens.size;
        console.assert(uniqueness);

        const score = uniqueness + 0.001 * page.isBookmarked;
        console.assert(score);
        return score;
    }

    token_score(token) {
        const token_object = this.token_object_by_text.get(token);
        if (!token_object) {
            return 0;
        }
        const score = token_object.weight * Math.pow(this.pagesByToken.size_get(token) + 1, UNIQUNESS_EXPORNENT);
        return score;
    }

    async pages_scores_by_url(targetPage, urlSet, urlSetList) {
        const page_score_element_by_url = new Map();
        for (const url of urlSet) {
            page_score_element_by_url.set(url, {});
        }

        const token_objects_target = [];
        for (const token_object of targetPage.token_objects) {
            if (token_object.string.length > 1) {
                token_objects_target.push(token_object);
            }
        }

        const score_by_token = new Map();
        for (const url of urlSet) {
            const page = this.pagesByToken.pageByUrl.get(url);
            if (!page) {
                urlSet.delete(url);
                console.warn(url);
                continue;
            }

            page_score_element_by_url.get(url).score_alone = 0;
            for (const token of page.tokens) {
                let score = 0;
                if (score_by_token.get(token)) {
                    score = score_by_token.get(token);
                } else {
                    const token_object = this.token_object_by_text.get(token);
                    const size = this.pagesByToken.size_get(token_object.string) + 1;
                    if (targetPage.token_objects.has(token_object)) {
                        score = SAME_TOKEN_SCORE_MULTIPLIER * token_object.weight * Math.pow(size, UNIQUNESS_EXPORNENT);
                    } else {
                        score = token_object.weight * Math.pow(size, UNIQUNESS_EXPORNENT);
                    }
                    score_by_token.set(token, score);
                }
                page_score_element_by_url.get(url).score_alone += score;
            }
            page_score_element_by_url.get(url).score_alone /= page.tokens.size;
        }

        let score_alone_max = Number.MIN_SAFE_INTEGER;
        let score_alone_min = Number.MAX_SAFE_INTEGER;
        for (const score_elem of page_score_element_by_url.values()) {
            if (score_alone_max < score_elem.score_alone) {
                score_alone_max = score_elem.score_alone;
            }
            if (score_alone_min > score_elem.score_alone) {
                score_alone_min = score_elem.score_alone;
            }
        }

        const scoreByUrl = new Map();
        const tabs = await browser.tabs.query({});
        console.assert(tabs.length > 0, tabs);
        for (const url of urlSet) {
            const page = this.pagesByToken.pageByUrl.get(url);
            if (!page) {
                throw `page is ${page}, url i ${url}`;
            }
            const bookmarkedScore = page.isBookmarked ? 1 : 0;
            const onTabScore = this.url_is_on_tab(url, tabs) ? 1 : 0;
            const score_alone_normaled =
                (page_score_element_by_url.get(url).score_alone - score_alone_min) / (score_alone_max - score_alone_min + 0.0000000000001);
            scoreByUrl.set(url, score_alone_normaled - 0.05 * bookmarkedScore + 0.00001 * onTabScore);
        }
        return scoreByUrl;
    }

    url_is_on_tab(url, tabs) {
        if (typeof url != 'string') {
            return false;
        }
        return tabs.map((tab) => tab.url).includes(url);
    }

    text_complexity_calc(text) {
        if (text.length == 0) {
            return 0;
        }
        const textComplexity = Array.from(text)
            .map((a) => a.charCodeAt())
            .reduce((a, b) => a + b);
        return textComplexity;
    }

    page_is_exist(url) {
        if (this.pagesByToken.pageByUrl.get(url)) {
            return true;
        }
        return false;
    }

    array_and(array1, array2) {
        return array1.filter((it) => array2.includes(it));
    }

    async tokens_calc(text) {
        if (!text) {
            return [];
        }

        const minComplexity = this.text_complexity_calc('zz');
        let tokens = await this.tokenizer.tokenize(text);
        tokens = tokens.map((s) => s.replace(/\s/g, ''));
        tokens = tokens.map((s) => s.toLowerCase());
        const tokens_bygram = tokens.concat(this.n_gram(tokens, 2));
        tokens = tokens.concat(tokens_bygram);
        tokens = tokens.filter((s) => s.length > 1);
        tokens = Array.from(new Set(tokens)).sort((s1, s2) => s1.length < s2.length);

        Test.assert(tokens, tokens);
        return tokens;
    }

    n_gram(target, n) {
        const result = [];
        for (let i = 0; i < target.length - n + 1; i++) {
            result.push(target.slice(i, i + n).join(''));
        }
        return result;
    }

    uri_is_decodable(text) {
        try {
            decodeURIComponent(text);
            return true;
        } catch (error) {
            return false;
        }
    }

    async tabs() {
        return await browser.tabs.query({});
    }

    /**
     * ブックマークからページオブジェクトを生成して、それを検索対象に追加する
     */
    async pages_create_from_bookmarks_without_network() {
        debugLog('createPagesFromBookmarksWithoutNetwork...');
        const pages = await this.bookmark_page_list();
        debugLog('pages from bookmark', pages);
        for (const page of pages.filter((p) => !this.page_is_exist(p))) {
            await this.page_register(page);
            this.page_tokens_weight_learn(page, TOKEN_REWARD_ON_REGISTER_FROM_BOOKMARK);
        }
        debugLog('pagesByToken', this.pagesByToken);
        debugLog('...createPagesFromBookmarksWithoutNetwork');
    }

    async bookmark_page_list() {
        const bookmarks = (await this.bookmark_array())
            .filter((b) => b.title)
            .filter((b) => b.url)
            .filter((b) => this.uri_is_decodable(b.url));
        const pages = [];
        for (const b of bookmarks) {
            const tokens = (await this.tokens_calc(b.title)).concat(this.tokens_from_url(b.url));
            pages.push(new Page(b.url, tokens, '', b.title, true, null));
        }
        return pages;
    }

    async bookmark_urlset() {
        const urls = (await this.bookmark_array())
            .map((b) => b.url)
            .filter((url) => url)
            .filter((url) => url.match(/^https?:\/\//g));
        return new Set(urls);
    }

    async url_is_bookmarked(url) {
        if (!url || url.constructor != String) {
            return false;
        }

        const bookmarks = await browser.bookmarks.search({ url: url });
        return bookmarks.length > 0;
    }

    async bookmark_array() {
        let bookmarks = [(await browser.bookmarks.getTree())[0]];
        console.assert(bookmarks);
        for (let i = 0; i < bookmarks.length; i++) {
            const bookmark = bookmarks[i];
            if (!(bookmark && bookmark.children)) {
                continue;
            }

            const children = bookmark.children.filter((child) => child);
            if (children) {
                bookmarks = bookmarks.concat(children);
            }
        }
        return bookmarks;
    }

    async page_innerText_save(page) {
        const text_content = await page.text_content;
        if (text_content == '') {
            return;
        }
        debugLog(page);
        return await LocalStorage.saveItem(page.url, text_content).catch((e) => {
            console.error(e);
            return '';
        });
    }

    async page_innerText_load_by_url(url) {
        return await LocalStorage.loadItem(url);
    }

    async pages_from_history(histories) {
        debugLog('createPagesFromHistory...');
        for (let history of histories) {
            if (this.url_is_exist(history.url)) {
                continue;
            }
            const page = await this.toPageFromHistory(history);
            if (this.page_is_exist(page)) {
                continue;
            }
            await this.page_register(page);
        }
        debugLog('...createPagesFromHistory');
    }

    url_is_exist(url, pageByUrl_ = this.pagesByToken.pageByUrl) {
        if (!url || url.constructor != String) {
            return false;
        }
        if (pageByUrl_.has(url)) {
            return true;
        }
        return false;
    }

    async toPageFromHistory(history) {
        const tokens = (await this.tokens_calc(history.title)).concat(this.tokens_from_url(history.url));
        return new Page(history.url, tokens, '', history.title, this.bookmarkedUrlSet.has(history.url), null);
    }

    async history_array() {
        let historyArray = await browser.history.search({ text: '', maxResults: HISTORY_MAX_LOAD, startTime: 0 });
        historyArray = historyArray.filter((history) => history.visitCount > HISTORY_VISITCOUNT_THRESHOLD);
        return historyArray;
    }
}

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

Test.test_履歴からページオブジェクトが生成できること = async function () {
    sleep(10000).then(async () => {
        const history = (await web_prowler.history_array())[0];
        const page = await web_prowler.toPageFromHistory(history);
        console.assert((await page.text_content).constructor == String, page);
        console.assert(page.url.constructor == String, page);
        console.assert(page.tab == null, page);
        console.assert(page.tokens.constructor == Set, page);
        console.assert(page.isBookmarked.constructor == Boolean, page);
    });
};

Test.test_URLと対応するページがあればtrueを返す = function () {
    const url = 'https://example.com';
    const pageByUrl_ = new Map([[url, new Page(url, [], null, 'example title', false, null, null)]]);
    Test.assert(web_prowler.url_is_exist(url, pageByUrl_));
};
Test.test_URLと対応するページがなければfalseを返す = function () {
    const url = 'https://example.com';
    const pageByUrl_ = new Map([[url, new Page(url, [], null, 'example title', false, null, null)]]);
    Test.assert(!web_prowler.url_is_exist('https://dont.exist.example.com', pageByUrl_));
};

Test.test_URLからページオブジェクトを生成できること = function () {
    (async () => {
        const url = 'https://example.com/';
        const page = await Page_get.createPageFromUrl(url);
        console.assert((await page.title) == 'Example Domain', await page.title);
        console.assert((await page.text_content).includes('This domain is for use in illustrative examples in documents.'), await page.text_content);
        console.assert(page.tokens.has('illustrative'), page);
        console.assert(page.url == url, page);
    })();
};

Test.test_body内のscriptは消すこと = function () {
    (async () => {
        const url = 'https://www.youtube.com/watch?v=lXOyo_INVfk';
        const page = await Page_get.createPageFromUrl(url);
        Test.assert(!(await page.text_content).includes('{'), await page.text_content);
    })();
};

Test.test_ページを登録できること = function () {
    setTimeout(async () => {
        const page_ = { url: 'https://example1.com/', text_content: 'example1 text fvtgbzamikolpxscerynhujwd', title: 'example1 site' };
        const message = { page: page_, type: 'register' };
        await web_prowler.page_register_on_message(message, null);

        const page = web_prowler.pagesByToken.pageByUrl.get(page_.url);
        console.assert(web_prowler.pagesByToken.pageByUrl.get(page.url) == page);
        console.assert(!Array.from(page.tokens).find((token) => !web_prowler.pagesByToken.get_pages(token).has(page)), page);
        console.assert(page.tokens.has('fvtgbzamikolpxscerynhujwd'), page);

        web_prowler.page_delete(page);
        console.assert(!web_prowler.pagesByToken.pageByUrl.get(page.url), web_prowler.pagesByToken.pageByUrl.get(page.url));
        console.assert(![...web_prowler.pagesByToken.values()].find((pages) => pages.has(page)));
    }, 0000);
};

Test.test_一つのメッセージで送られた複数のページを一括で登録できること = function () {
    setTimeout(async () => {
        const random = Math.random();
        const pages = [
            { url: 'https://example1.com/page_register_multi' + random, text_content: 'example1 text dcrfvzqwtyabgsxe', title: 'example1 site' },
            { url: 'https://example2.com/page_register_multi' + random, text_content: 'example2 text bfgvxvteytcrdbgys', title: 'example2 site' },
        ];

        for (const page_ of pages) {
            const page = web_prowler.pagesByToken.pageByUrl.get(page_.url);
            if (page) {
                web_prowler.page_delete(page);
            }
        }

        const message = { pages: pages, type: 'registers' };
        await web_prowler.pages_register_on_message(message, null);

        for (const page_ of pages) {
            const page = web_prowler.pagesByToken.pageByUrl.get(page_.url);
            console.assert(page, page_.url);
            console.assert(web_prowler.pagesByToken.pageByUrl.get(page.url) == page, page);
            console.assert(!Array.from(page.tokens).find((token) => !web_prowler.pagesByToken.get_pages(token).has(page)), page);
        }
        console.assert(web_prowler.pagesByToken.get_pages('dcrfvzqwtyabgsxe'));
        console.assert(web_prowler.pagesByToken.get_pages('bfgvxvteytcrdbgys'));

        for (const page_ of pages) {
            const page = web_prowler.pagesByToken.pageByUrl.get(page_.url);
            web_prowler.page_delete(page);
        }
    }, 1000);
};
Test.test_urlが同じページが登録されても古い奴が消されていること = function () {
    setTimeout(async () => {
        const url = 'https://example.com/page_old_delete' + Math.random();
        if (web_prowler.pagesByToken.pageByUrl.has(url)) {
            web_prowler.page_delete(web_prowler.pagesByToken.pageByUrl.get(url));
        }
        const pages = [
            { url: url, text_content: 'example3 text azqwsxedcrfvtbgy', title: 'example1 site' },
            { url: url, text_content: 'example3 text vcrfxvtbgytbgyse', title: 'example2 site' },
        ];
        const message = { pages: pages, type: 'registers' };
        await web_prowler.pages_register_on_message(message, null);

        for (const page_ of pages) {
            const page = web_prowler.pagesByToken.pageByUrl.get(page_.url);
            console.assert(web_prowler.pagesByToken.pageByUrl.get(page.url) == page, page);
            console.assert(!Array.from(page.tokens).find((token) => !web_prowler.pagesByToken.get_pages(token).has(page)), page);
        }
        console.assert(web_prowler.pagesByToken.size_get('vcrfxvtbgytbgyse') + web_prowler.pagesByToken.size_get('azqwsxedcrfvtbgy') == 1);
        web_prowler.page_delete(web_prowler.pagesByToken.pageByUrl.get(url));
    }, 2000);
};

Test.test_推奨システムが最低限度動くこと = function () {
    setTimeout(async () => {
        const url = 'https://example.com/recommend/' + Math.random();
        if (web_prowler.pagesByToken.pageByUrl.has(url)) {
            web_prowler.page_delete(web_prowler.pagesByToken.pageByUrl.get(url));
        }
        for (const url_sxedcazqwrfvtbgy of web_prowler.pagesByToken.get_urls('sxedcazqwrfvtbgy')) {
            web_prowler.page_delete(web_prowler.pagesByToken.pageByUrl.get(url_sxedcazqwrfvtbgy));
        }
        for (const url_tbgyvcrfxvtbgyse of web_prowler.pagesByToken.get_urls('tbgyvcrfxvtbgyse')) {
            web_prowler.page_delete(web_prowler.pagesByToken.pageByUrl.get(url_tbgyvcrfxvtbgyse));
        }
        console.assert(web_prowler.pagesByToken.size_get('sxedcazqwrfvtbgy') == 0, web_prowler.pagesByToken.get_urls('sxedcazqwrfvtbgy'));
        console.assert(web_prowler.pagesByToken.size_get('tbgyvcrfxvtbgyse') == 0, web_prowler.pagesByToken.get_urls('tbgyvcrfxvtbgyse'));

        const pages = [
            { url: url, text_content: 'example3 text sxedcazqwrfvtbgy', title: 'example1 site' },
            { url: url, text_content: 'example3 text tbgyvcrfxvtbgyse', title: 'example2 site' },
        ];
        const message_register = { pages: pages, type: 'registers' };
        await web_prowler.pages_register_on_message(message_register, null);

        for (const page_ of pages) {
            const page = web_prowler.pagesByToken.pageByUrl.get(page_.url);
            console.assert(web_prowler.pagesByToken.pageByUrl.get(page.url) == page, page);
            console.assert(!Array.from(page.tokens).find((token) => !web_prowler.pagesByToken.get_pages(token).has(page)), page);
        }
        console.assert(
            web_prowler.pagesByToken.size_get('sxedcazqwrfvtbgy') + web_prowler.pagesByToken.size_get('tbgyvcrfxvtbgyse') == 1,
            web_prowler.pagesByToken.get_urls('sxedcazqwrfvtbgy'),
            web_prowler.pagesByToken.get_urls('tbgyvcrfxvtbgyse')
        );

        const message_recommend = { page: { url: url, text_request: 'tbgyvcrfxvtbgyse' }, type: 'recommend' };
        await web_prowler.recommend_on_message(message_recommend);

        web_prowler.page_delete(web_prowler.pagesByToken.pageByUrl.get(url));
    }, 3000);
};

Test.test_テキストを分かち書きしてトークンが取り出せること = async function () {
    const text =
        'このフレームワークでは、自社が置かれた状況をCustomer（顧客）、Competitor（競合）、Company（自社）の観点から情報を整理し、顧客に対する相対的な競合優位性を検証します。';
    const tokens = await web_prowler.tokens_calc(text);
    console.assert(
        JSON.stringify(tokens) ==
            JSON.stringify([
                'competitor競合',
                '）competitor',
                'competitor',
                'このフレームワーク',
                'をcustomer',
                'customer（',
                '競合company',
                'customer',
                'フレームワークで',
                'companyの',
                'フレームワーク',
                'company',
                'に対する相対',
                'しに対する',
                'に対する',
                '観点から',
                'から情報',
                '情報整理',
                '検証ます',
                '、自社',
                '自社が',
                'が置か',
                '置かれ',
                'た状況',
                '状況を',
                '（顧客',
                '顧客）',
                'の観点',
                '整理し',
                '相対的',
                'な優位',
                '優位性',
                '性検証',
                'ます。',
                'この',
                '自社',
                '置か',
                '状況',
                '顧客',
                '競合',
                '観点',
                'から',
                '情報',
                '整理',
                '相対',
                '優位',
                '検証',
                'ます',
                'では',
                'は、',
                'れた',
                '的な',
            ]),
        tokens
    );
};
Test.test_URIをでコードできること = function () {
    console.assert(!web_prowler.uri_is_decodable('https://scrapbox.io/t-Impression/search/page?q=%s'));
    console.assert(web_prowler.uri_is_decodable('https://scrapbox.io/t-Impression/search/page'));
};

const web_prowler = new WebProwler();
web_prowler.init().then(() => {
    Test.run();
});
