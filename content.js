const dicPath = chrome.runtime.getURL("dict/");

kuromoji.builder({ dicPath: dicPath }).build(function(err, tokenizer) {
    if (err) {
        console.error("エラー: 形態素解析器 (Kuromoji.js) のロードに失敗しました。", 
                      "辞書ファイル(dict/)のパスや配置を確認してください。",
                      "エラー詳細:", err);
        return;
    }

    console.log("形態素解析器の準備が完了しました。");

    findAndProcessNovelBody(tokenizer);
});

// 本文要素を特定し、処理を開始する関数
function findAndProcessNovelBody(tokenizer) {
    const selector = 'div.p-novel__body';
    
    let attempts = 0;
    const maxAttempts = 30; 
    
    const intervalId = setInterval(() => {
        const novelHonbun = document.querySelector(selector);
        
        if (novelHonbun) {
            clearInterval(intervalId);
            console.log(`小説の本文要素 (${selector}) が見つかりました。ルビ振り処理を開始します。`);
            processHonbun(novelHonbun, tokenizer);
            
        } else if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            console.error("エラー: 小説の本文要素が見つかりませんでした。",
                          "指定されたセレクタ:", selector,
                          "→ このセレクタが現在のページのHTML構造と一致しているか、開発者ツールで確認してください。");
        }
        
        attempts++;
    }, 100);
}

// 本文の解析と書き換え処理
function processHonbun(novelHonbun, tokenizer) {
    
    const walker = document.createTreeWalker(
        novelHonbun,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentNode;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest && parent.closest('script,style')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(textNode => {
        const frag = createFragmentFromText(textNode.nodeValue);
        if (frag.childNodes.length > 0) {
            textNode.parentNode.replaceChild(frag, textNode);
        }
    });

    // クリック／タップで個別にルビ化（トグル）
    const handler = (e) => handleCandidateActivate(e, tokenizer);
    novelHonbun.addEventListener('click', handler);
    novelHonbun.addEventListener('pointerup', handler, { passive: true });
}

// 共通ハンドラ：イベントオブジェクトからターゲットを取得して処理
function handleCandidateActivate(e, tokenizer) {
    // pointerup/touchend の場合にスクロール等と誤検知しないよう追加条件を入れたい場合はここで判定
    const target = e.target;
    if (!target.classList || !target.classList.contains('ruby-candidate')) return;

    // 既に ruby を含んでいる場合は元のテキストに戻す
    const existingRuby = target.querySelector && target.querySelector('ruby');
    if (existingRuby) {
        const textNode = document.createTextNode(target.dataset.surface || target.textContent);
        target.parentNode.replaceChild(textNode, target);
        return;
    }

    const surface = target.dataset.surface;
    if (!surface) return;

    try {
        const tokens = tokenizer.tokenize(surface);
        const readings = tokens.map(t => t.reading || t.surface || '').join('');
        if (!readings) return;
        const hiragana = katakanaToHiragana(readings);
        const ruby = document.createElement('ruby');
        ruby.textContent = surface;
        const rt = document.createElement('rt');
        rt.textContent = hiragana;
        ruby.appendChild(rt);

        target.innerHTML = '';
        target.appendChild(ruby);
    } catch (err) {
        console.error('ルビ取得中にエラー:', err);
    }
}


// テキストを分割して漢字列だけをクリック可能なspan要素にする
function createFragmentFromText(text){
    const frag = document.createDocumentFragment();
    const parts = text.split(/([\u4e00-\u9faf]+)/g);
    parts.forEach(part=>{
        if(!part) return;
        if (part.match(/^[\u4e00-\u9faf]+$/)) {
            const span = document.createElement('span');
            span.className = 'ruby-candidate';
            span.dataset.surface = part;
            span.textContent = part;
            // スタイルは必要に応じて CSS で調整（例えば拡張機能の content script で追加）
            frag.appendChild(span);
        } else {
            frag.appendChild(document.createTextNode(part));
        }
    });
    return frag;
}


// テキストを形態素解析し、ルビ（<ruby>タグ）を挿入する関数（未使用だが保留）
function processText(text, tokenizer) {
    if (!text || text.trim() === '') return text;

    const tokens = tokenizer.tokenize(text);
    let resultHtml = '';

    tokens.forEach(token => {
        const surface = token.surface || token.surface_form || '';
        const reading = token.reading || ''; 
        if (surface && surface.match(/[\u4e00-\u9faf]/) && reading) {
            const hiragana = katakanaToHiragana(reading);
            const rubyTag = `<ruby>${surface}<rt>${hiragana}</rt></ruby>`;
            resultHtml += rubyTag;
        } else {
            resultHtml += surface;
        }
    });

    return resultHtml;
}

// カタカナをひらがなに変換する関数
function katakanaToHiragana(kata) {
    return kata.replace(/[\u30a1-\u30f6]/g, function(match) {
        var chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
    });
}