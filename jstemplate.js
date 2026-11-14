/**
 * Word cloud template for the Moodle database activity ("Wortwolke").
 *
 * Custom implementation without external libraries (no D3, no CDN).
 * Works with Moodle 4 and Moodle 5.
 *
 * Flow:
 *   1. Collect the words of all entries (span.wordcloud-words, separated by ";")
 *   2. Count frequencies (case-insensitive, deliberately without stop-word
 *      filtering: filler words such as "die" or "und" stay in the cloud so
 *      they can be analysed in German lessons)
 *   3. Render the cloud as SVG: biggest word in the vertical centre, sizes
 *      decreasing towards the edges (pyramid layout), fixed colour palette
 *   4. Responsive: the SVG is displayed at 95% width and scales down on
 *      small screens; the layout adapts when the window is resized
 *   5. Download button: save the cloud as a standalone SVG file
 */
(function () {
    'use strict';

    /* ---------------------------------------------------------------
     * Constants
     * --------------------------------------------------------------- */

    // Fixed colour palette, assigned in order (no randomness).
    var PALETTE = [
        '#1f77b4', '#d62728', '#2ca02c', '#ff7f0e',
        '#9467bd', '#8c564b', '#e377c2', '#17becf'
    ];

    var MIN_WORD_LENGTH = 2;      // ignore shorter tokens (e. g. single letters)
    var MAX_CLOUD_WIDTH = 1500;   // maximum virtual cloud width (desktop)
    var MIN_CLOUD_WIDTH = 350;    // lower bound so a line break always exists
    var MIN_FONT_SIZE = 14;       // font size for words with 1 occurrence
    var MAX_FONT_SIZE = 90;       // font size for the most frequent word
    var FONT_STACK = "'Impact', 'Arial Black', sans-serif";
    var RESIZE_DELAY_MS = 200;    // debounce for the resize handler

    var SVG_NS = 'http://www.w3.org/2000/svg';

    /* ---------------------------------------------------------------
     * State
     * --------------------------------------------------------------- */

    var currentWords = [];        // cache for redrawing on window resize

    // Lazily created 2D context – fallback when getBBox() is unavailable.
    var measureContext = null;

    /* ---------------------------------------------------------------
     * Word counting
     * --------------------------------------------------------------- */

    /**
     * Counts the words of a text (tokens separated by ";").
     * Counting is case-insensitive ("Haus" and "haus" add up), but the word
     * is displayed in the spelling of its first occurrence so that umlauts
     * and "ß" are not corrupted by toUpperCase() ("Straße" -> "STRASSE").
     * Words with a single occurrence are deliberately kept.
     *
     * @param {string} text
     * @returns {Array<{word: string, count: number}>} sorted by count, descending
     */
    function countWords(text) {
        if (typeof text !== 'string' || !text) {
            return [];
        }
        var counts = {};
        var order = [];
        text.split(';').forEach(function (raw) {
            var word = raw.trim();
            var key = word.toUpperCase();
            if (key.length >= MIN_WORD_LENGTH) {
                if (counts[key]) {
                    counts[key]++;
                } else {
                    counts[key] = 1;
                    order.push({ word: word, count: 1 });
                }
            }
        });
        // Insert the final counts (words were added with count 1)
        order.forEach(function (item) {
            item.count = counts[item.word.toUpperCase()];
        });
        order.sort(function (a, b) { return b.count - a.count; });
        return order;
    }

    /* ---------------------------------------------------------------
     * Rendering
     * --------------------------------------------------------------- */

    /**
     * Font size depending on the frequency (square root scaling, common for
     * word clouds). Falls back to MIN_FONT_SIZE for invalid input.
     *
     * @param {number} count
     * @param {number} maxCount
     * @returns {number}
     */
    function fontSizeFor(count, maxCount) {
        if (typeof count !== 'number' || typeof maxCount !== 'number' ||
            count < 1 || maxCount < 1 || count <= 1 || maxCount <= 1) {
            return MIN_FONT_SIZE;
        }
        var share = (Math.sqrt(count) - 1) / (Math.sqrt(maxCount) - 1);
        return Math.round(MIN_FONT_SIZE + share * (MAX_FONT_SIZE - MIN_FONT_SIZE));
    }

    /**
     * Measures the real rendered width of an SVG text element.
     * Primary method: getBBox() – exact, independent of font fallbacks.
     * Fallback: canvas measureText (e. g. if the element is not rendered).
     *
     * @param {SVGTextElement} element
     * @param {number} fontSize - needed for the canvas fallback
     * @param {string} text
     * @returns {number}
     */
    function measureTextWidth(element, fontSize, text) {
        var box = element.getBBox();
        if (box && box.width) {
            return box.width;
        }
        if (!measureContext) {
            var canvas = document.createElement('canvas');
            measureContext = canvas.getContext('2d');
        }
        measureContext.font = fontSize + 'px ' + FONT_STACK;
        return measureContext.measureText(text).width;
    }

    /**
     * Builds the pyramid stacking order: the largest row goes to the
     * vertical centre, the following rows alternate below and above it,
     * so the rows get smaller towards the outside.
     *
     * @param {Array<Array<object>>} rows - rows sorted by size, descending
     * @returns {Array<Array<object>>} rows in vertical order
     */
    function pyramidOrder(rows) {
        var rowCount = rows.length;
        var centre = Math.floor((rowCount - 1) / 2);
        var slots = [centre];
        for (var distance = 1; slots.length < rowCount; distance++) {
            if (centre + distance < rowCount) {
                slots.push(centre + distance);
            }
            if (centre - distance >= 0 && slots.length < rowCount) {
                slots.push(centre - distance);
            }
        }
        var stacked = new Array(rowCount);
        rows.forEach(function (row, index) {
            stacked[slots[index]] = row;
        });
        return stacked;
    }

    /**
     * Renders the cloud: centred lines, largest word in the middle, smaller
     * words towards the outside (pyramid layout, no rotation). Word widths
     * are measured on the final SVG via getBBox(), so the viewBox matches
     * the rendered text exactly and nothing gets clipped.
     *
     * @param {Array<{word: string, count: number}>} words - sorted by count
     * @returns {void}
     */
    function renderCloud(words) {
        var chart = document.getElementById('wordcloud-chart');
        if (!chart || !Array.isArray(words)) {
            return;
        }
        chart.innerHTML = '';

        if (!words.length) {
            var hint = document.createElement('p');
            hint.textContent = 'Keine Wörter gefunden.';
            chart.appendChild(hint);
            return;
        }

        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Wortwolke mit ' + words.length + ' Wörtern');
        // Attach first: getBBox() only works on rendered elements
        chart.appendChild(svg);

        var maxCount = words[0].count;

        /* 1. Create the text elements with their initial font size.
         *    They stay in the SVG and only get their position later. */
        var items = words.map(function (entry) {
            var fontSize = fontSizeFor(entry.count, maxCount);
            var element = document.createElementNS(SVG_NS, 'text');
            element.setAttribute('text-anchor', 'start');
            element.setAttribute('style',
                'font-size:' + fontSize + 'px;font-family:' + FONT_STACK + ';');
            element.textContent = entry.word;
            svg.appendChild(element);
            return {
                word: entry.word,
                fontSize: fontSize,
                element: element,
                width: 0,
                x: 0
            };
        });

        /* 2. Measure the real rendered widths (plus the gap to the next word). */
        var gapRatio = 0.6;
        items.forEach(function (item) {
            item.width = measureTextWidth(item.element, item.fontSize, item.word) +
                item.fontSize * gapRatio;
        });

        /* 3. Target width: row count ~ sqrt(n) -> a compact cloud instead of
         *    a single long line. */
        var containerWidth = chart.clientWidth || (window.innerWidth || 800) - 40;
        var maxWidth = Math.min(MAX_CLOUD_WIDTH, containerWidth || MAX_CLOUD_WIDTH);
        var targetRows = Math.max(2, Math.ceil(Math.sqrt(items.length)));
        var totalWidth = items.reduce(function (sum, item) { return sum + item.width; }, 0);
        var cloudWidth = Math.round(Math.min(maxWidth, totalWidth / targetRows * 1.2));
        if (cloudWidth < MIN_CLOUD_WIDTH) {
            cloudWidth = MIN_CLOUD_WIDTH;
        }

        /* 4. Scale down single words that are wider than the cloud
         *    (e. g. long field names) and re-measure them. */
        items.forEach(function (item) {
            if (item.width > cloudWidth) {
                item.fontSize = Math.max(MIN_FONT_SIZE,
                    Math.floor(item.fontSize * cloudWidth / item.width));
                item.element.setAttribute('style',
                    'font-size:' + item.fontSize + 'px;font-family:' + FONT_STACK + ';');
                item.width = measureTextWidth(item.element, item.fontSize, item.word) +
                    item.fontSize * gapRatio;
            }
        });

        /* 5. Line wrapping: place the words line by line. */
        var rows = [];
        var currentRow = [];
        var x = 0;
        items.forEach(function (item) {
            if (currentRow.length > 0 && x + item.width > cloudWidth) {
                rows.push(currentRow);
                currentRow = [];
                x = 0;
            }
            item.x = x;                 // left edge within the line
            x += item.width;
            currentRow.push(item);
        });
        if (currentRow.length) {
            rows.push(currentRow);
        }

        /* 6. Pyramid layout (largest row in the centre). */
        rows = pyramidOrder(rows);

        /* 7. Final width: at least as wide as the widest row. */
        var widestRow = 0;
        rows.forEach(function (row) {
            var width = row[row.length - 1].x + row[row.length - 1].width;
            if (width > widestRow) {
                widestRow = width;
            }
        });
        if (widestRow > cloudWidth) {
            cloudWidth = Math.ceil(widestRow);
        }

        /* 8. Centre the rows and position the words
         *    (one shared baseline per row). */
        var y = 0;
        var paletteIndex = 0;
        rows.forEach(function (row) {
            var rowWidth = row[row.length - 1].x + row[row.length - 1].width;
            var maxFontSize = 0;
            row.forEach(function (item) {
                if (item.fontSize > maxFontSize) {
                    maxFontSize = item.fontSize;
                }
            });
            var lineHeight = maxFontSize * 1.2;
            var baseline = y + maxFontSize * 0.85;
            var offset = Math.max(0, (cloudWidth - rowWidth) / 2);
            row.forEach(function (item) {
                item.element.setAttribute('x',
                    Math.round((offset + item.x + item.fontSize * 0.2) * 10) / 10);
                item.element.setAttribute('y', Math.round(baseline * 10) / 10);
                item.element.setAttribute('fill', PALETTE[paletteIndex % PALETTE.length]);
                paletteIndex++;
            });
            y += lineHeight;
        });

        var height = Math.ceil(y);
        svg.setAttribute('viewBox', '0 0 ' + cloudWidth + ' ' + height);
        // Fixed size for the downloaded file. The display is controlled by
        // the CSS template: #chart svg { width:95%; height:auto; }
        svg.setAttribute('width', cloudWidth);
        svg.setAttribute('height', height);

        addDownloadButton(svg);
    }

    /**
     * Places the download button in the button row next to the other
     * buttons. A previously added button is removed first so redrawing
     * never creates duplicates.
     *
     * @param {SVGElement} svg
     * @returns {void}
     */
    function addDownloadButton(svg) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary wordcloud-download';
        button.textContent = 'Wortwolke herunterladen';
        button.addEventListener('click', function () {
            downloadSvg(svg);
        });

        var buttonRow = document.querySelector('.wordcloud-buttons');
        if (buttonRow) {
            var existing = buttonRow.querySelector('.wordcloud-download');
            if (existing) {
                existing.parentNode.removeChild(existing);
            }
            buttonRow.insertBefore(button, buttonRow.firstChild);
        } else {
            document.getElementById('wordcloud-chart').appendChild(button);
        }
    }

    /* ---------------------------------------------------------------
     * Download
     * --------------------------------------------------------------- */

    /**
     * Saves the cloud as a standalone SVG file (no external dependencies).
     *
     * @param {SVGElement} svg
     * @returns {void}
     */
    function downloadSvg(svg) {
        if (!svg || typeof XMLSerializer === 'undefined' ||
            typeof Blob === 'undefined' || !window.URL ||
            typeof window.URL.createObjectURL !== 'function') {
            return;  // browser does not support the download
        }
        var content = '<?xml version="1.0" encoding="UTF-8"?>\n' +
            new XMLSerializer().serializeToString(svg);
        var blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
        var url = window.URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'wortwolke.svg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(function () {
            window.URL.revokeObjectURL(url);
        }, 1000);
    }

    /* ---------------------------------------------------------------
     * Init
     * --------------------------------------------------------------- */

    /**
     * Collects the words of all entries (span.wordcloud-words). textContent is used
     * instead of innerText to avoid forced reflows.
     *
     * @returns {string} all words joined with ";"
     */
    function collectEntryText() {
        var text = '';
        document.querySelectorAll('.wordcloud-words').forEach(function (element) {
            text += element.textContent + ';';
        });
        return text;
    }

    /**
     * Fills the hidden output element with the unique word list.
     *
     * @param {string} text
     * @returns {void}
     */
    function fillWordList(text) {
        var seen = {};
        var unique = [];
        text.split(';').forEach(function (raw) {
            var word = raw.trim();
            var key = word.toUpperCase();
            if (word && !seen[key]) {
                seen[key] = true;
                unique.push(word);
            }
        });
        unique.sort();
        var output = document.getElementById('wordcloud-output');
        if (output) {
            output.textContent = unique.join(', ');
        }
    }

    /**
     * Redraws the cloud when the window is resized (e. g. rotating a phone).
     * Registered only once – init() may run multiple times.
     *
     * @returns {void}
     */
    function registerResizeHandler() {
        if (window.WordCloud.resizeHandler) {
            return;
        }
        window.WordCloud.resizeHandler = true;
        var timer = null;
        window.addEventListener('resize', function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
                renderCloud(currentWords);
            }, RESIZE_DELAY_MS);
        });
    }

    /**
     * Entry point: reads the entries and renders the cloud. Called on page
     * load and after every content swap of the auto reload.
     *
     * @returns {void}
     */
    function refresh() {
        var chart = document.getElementById('wordcloud-chart');
        if (!chart) {
            return;  // not on the list view – do nothing
        }

        var text = collectEntryText();
        fillWordList(text);

        currentWords = countWords(text);
        renderCloud(currentWords);
    }

    /* ---------------------------------------------------------------
     * Public API + boot
     * --------------------------------------------------------------- */

    // The header template calls this after every content swap of the
    // auto reload so the cloud is drawn with the new entries.
    window.WordCloud = { refresh: refresh };

    // Run immediately when the DOM is already ready,
    // otherwise wait for DOMContentLoaded.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            registerResizeHandler();
            refresh();
        });
    } else {
        registerResizeHandler();
        refresh();
    }
})();
