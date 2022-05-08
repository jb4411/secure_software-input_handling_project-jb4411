const sanitizeHTML = require('sanitize-html');

// Sanity check method to make sure you have your environment up and running.
function sum(a, b){
    return a + b;
}


const blockList = ["Boaty McBoatface"];
const allowListRegex = /^[A-Za-z\d\-'" \p{Letter}\u0900-\u097F\uA8E0-\uA8FF\u1CD0-\u1CFA]+$/u;

/*
  Valid book titles in this situation can include:
    - Cannot be any form of "Boaty McBoatface", case insensitive
    - English alphabet characters
    - Arabic numerals
    - Spaces, but no other whitespace like tabs or newlines
    - Quotes, both single and double
    - Hyphens
    - No leading or trailing whitespace
    - No newlines or tabs
*/
function isTitle(str){
    let notBlocked = !blockList.some(arrVal => str.toLowerCase() === arrVal.toLowerCase());
    let allowed = allowListRegex.test(str.normalize()); //"NFKC"
    let noExcessWhitespace = str === str.trim();

    return notBlocked && allowed && noExcessWhitespace;
}


const ligatureMap = new Map([
    ['\uA732',      'AA'],
    ['\uA733',      'aa'],
    ['\u00C6',      'AE'],
    ['\u00E6',      'ae'],
    ['\uA734',      'AO'],
    ['\uA735',      'ao'],
    ['\uA736',      'AU'],
    ['\uA737',      'au'],
    ['\uA738',      'AV'],
    ['\uA739',      'av'],
    ['\uA73A',      'AV'],
    ['\uA73B',      'av'],
    ['\uA73C',      'AY'],
    ['\uA73D',      'ay'],
    ['\u1F670',     'et'],
    ['\uFB00',      'ff'],
    ['\uFB03',      'ffi'],
    ['\uFB04',      'ffl'],
    ['\uFB01',      'fi'],
    ['\uFB02',      'fl'],
    ['\u01F6',      'Hv'],
    ['\u0195',      'hv'],
    ['\u2114',      'lb'],
    ['\u1EFA',      'lL'],
    ['\u1EFB',      'll'],
    ['\u0152',      'OE'],
    ['\u0153',      'oe'],
    ['\uA74E',      'OO'],
    ['\uA74F',      'oo'],
    ['\uAB62',      'ɔe'],
    ['\u1E9E',      'ſs'],
    ['\u00DF',      'ſz'],
    ['\uFB06',      'st'],
    ['\uFB05',      'ſt'],
    ['\uA728',      'TZ'],
    ['\uA729',      'tz'],
    ['\u1D6B',      'ue'],
    ['\uAB63',      'uo'],
    ['\u0057',      'VV'],
    ['\u0077',      'vv'],
    ['\uA760',      'VY'],
    ['\uA761',      'vy'],
    ['\uAB31',      'aə'],
    ['\uAB41',      'əø'],
    ['\u0238',      'db'],
    ['\u02A3',      'dz'],
    ['\uAB66',      'dʐ'],
    ['\u02A5',      'dʑ'],
    ['\u02A4',      'dʒ'],
    ['\u02A9',      'fŋ'],
    ['\u02AA',      'ls'],
    ['\u02AB',      'lz'],
    ['\u026E',      'lʒ'],
    ['\uAB40',      'oə'],
    ['\u0239',      'qp'],
    ['\u02A8',      'tɕ'],
    ['\u02A6',      'ts'],
    ['\uAB67',      'tʂ'],
    ['\u02A7',      'tʃ'],
    ['\uAB50',      'ui'],
    ['\uAB51',      'ui'],
    ['\u026F',      'uu']
])

/*
  Are the two titles *effectively* the same when searching?

  This function will be used as part of a search feature, so it should be
  flexible when dealing with diacritics and ligatures.

  Input: two raw strings
  Output: true if they are "similar enough" to each other

  We define two strings as the "similar enough" as:

    * ignore leading and trailing whitespace
    * same sequence of "letters", ignoring diacritics and ligatures, that is:
      anything that is NOT a letter in the UTF-8 decomposed form is removed
    * Ligature "\u00E6" or æ is equivalent to "ae"
    * German character "\u1E9E" or ẞ is equivalent to "ss"
*/
function isSameTitle(strA, strB){
    const replacementRegex = /[^\p{Letter}]|[\u0300-\u036F\u1AB0-\u1ACE\u1DC0-\u1DFF\u20D0-\u20F0\uFE20-\uFE2F]/gui;
    const justLetters = /[\p{Letter}]/gui;

    let strAType = Object.prototype.toString.call(strA);
    let strBType = Object.prototype.toString.call(strB);
    if(strAType !== '[object String]' || strBType !== '[object String]') {
        return false;
    }

    let processedA = strA.match(justLetters).join();
    let processedB = strB.match(justLetters).join();

    processedA = processedA.normalize("NFKD");
    processedB = processedB.normalize("NFKD");

    processedA = processedA.replaceAll(replacementRegex, "");
    processedB = processedB.replaceAll(replacementRegex, "");

    let currentChar = ""
    for (let i = 0; i < processedA.length; i++) {
        currentChar = processedA.charAt(i)
        if(ligatureMap.has(currentChar)) {
            processedA = processedA.replace(currentChar, ligatureMap.get(currentChar));
        }
    }

    for (let i = 0; i < processedB.length; i++) {
        currentChar = processedB.charAt(i)
        if(ligatureMap.has(currentChar)) {
            processedB = processedB.replace(currentChar, ligatureMap.get(currentChar));
        }
    }

    return processedA === processedB;
}


/*
  Page range string.

  Count, inclusively, the number of pages mentioned in the string.

  This is modeled after the string you can use to specify page ranges in
  books, or in a print dialog.

  Example page ranges, copied from our test cases:
    1          ===> 1 page
    p3         ===> 1 page
    1-2        ===> 2 pages
    10-100     ===> 91 pages
    1-3,5-6,9  ===> 6 pages
    1-3,5-6,p9 ===> 6 pages

  A range that goes DOWN still counts, but is never negative.

  Whitespace is allowed anywhere in the string with no effect.

  If the string is over 1000 characters, return undefined
  If the string returns in NaN, return undefined
  If the string does not properly fit the format, return 0

*/
function countPages(rawStr){
    if(rawStr.length > 1000) {
        return undefined;
    }

    let result = 0;
    let parts = rawStr.split(",");
    for(const element of parts) {
        let range = element.split("-");
        let pageNum;
        if(range.length === 1) {
            pageNum = cleanPageNum(range[0]);
            if(pageNum === undefined) {
                return 0;
            }
            result += 1;
        } else {
            let rangeArray = [];
            for(const num of range) {
                pageNum = cleanPageNum(num);
                if(pageNum === undefined) {
                    return 0;
                }
                rangeArray.push(pageNum);
            }
            if(rangeArray.length !== 2) {
                return 0;
            }
            result += Math.abs(rangeArray[0] - rangeArray[1]) + 1;
        }
    }
    // check for integer imprecision
    if(result > Number.MAX_SAFE_INTEGER) {
        return undefined;
    }
    return result;
}


/*
  Perform a best-effort cleansing of the page number.
  Given: a raw string
  Returns: an integer, ignoring leading and trailing whitespace. And it can have p in front of it.
*/
function cleanPageNum(str){
    // regex named capture group to get the page number
    const captureNum = /(?<pageNum>\d+)/;
    // regex to remove whitespace
    const regexRemoveWhitespace = /[\s+]/g;
    // regex to get all numbers with a 'p' in front of them
    const regexpPageNumWithp = /p(\d+)/g;
    // regex to get all numbers that do not have a 'p' in front of them
    const regexpJustPageNum = /(?<!p\d*)(\d+)/g;

    let trimmedStr = str.replaceAll(regexRemoveWhitespace, "");
    if(trimmedStr.match(/[^p\d]/) !== null) {
        return undefined;
    }
    let pageNumWithp = trimmedStr.match(regexpPageNumWithp);
    let justPageNum = trimmedStr.match(regexpJustPageNum);

    let pNum = (pageNumWithp !== null);
    let justNum = (justPageNum !== null);
    // If both are null, or neither is null, return undefined
    if(pNum === justNum) {
        return undefined;
    }

    let processedStr;
    if(pNum) {
        // The page number had a p in front of it
        processedStr = pageNumWithp;
    } else {
        processedStr = justPageNum;
    }

    if(processedStr.length === 1) {
        return parseInt(processedStr[0].match(captureNum).groups.pageNum);
    }

    return undefined;
}


/*
  Given a string, return another string that is safe for embedding into HTML.
    * Use the sanitize-html library: https://www.npmjs.com/package/sanitize-html
    * Configure it to *only* allow <b> tags and <i> tags
      (Read the README to learn how to do this)
*/
function cleanForHTML(dirty) {
    let clean = sanitizeHTML(dirty, {
        disallowedTagsMode: ['recursiveEscape'],
        allowedTags: ['b', 'i']
    });
    // escape single quotes
    clean = clean.replaceAll('"', '&quot;');
    // escape double quotes
    clean = clean.replaceAll("'", '&#x27;');
    return clean;
}




// Too all my JS nitpickers...
// We are using CommonJS modules because that's what Jest currently best supports
// But, the more modern, preferred way is ES6 modules, i.e. "import/export"
module.exports = {
    sum,
    isTitle,
    countPages,
    cleanPageNum,
    isSameTitle,
    cleanForHTML,
};
