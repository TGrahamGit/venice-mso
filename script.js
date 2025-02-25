// Configuration
const WORKER_URL = 'https://venice-chatbot.graham-business-ventures.workers.dev';
const BACKGROUND_IMAGES = [
    'https://raw.githubusercontent.com/TGrahamGit/venice-mso/main/VeniceAI_Vf7NGoK.webp',
    'https://raw.githubusercontent.com/TGrahamGit/venice-mso/main/VeniceAI_jXw0mwJ.webp',
    'https://raw.githubusercontent.com/TGrahamGit/venice-mso/main/VeniceAI_sFkAxgA.webp'
];

// DOM Elements
const form = document.getElementById('chat-form');
const input = document.getElementById('input');
const chatbox = document.getElementById('chatbox');
let bgIndex = 0;

// Background System
BACKGROUND_IMAGES.forEach(url => new Image().src = url); // Preload images

function rotateBackground() {
    document.body.style.backgroundImage = `url(${BACKGROUND_IMAGES[bgIndex]})`;
    bgIndex = (bgIndex + 1) % BACKGROUND_IMAGES.length;
}

rotateBackground();
setInterval(rotateBackground, 30000);

// Chat Functions
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMessage = input.value.trim();
    if (!userMessage) return;

    addMessage('user', userMessage);
    input.value = '';
    form.querySelector('button').disabled = true;

    const loadingMessage = addMessage('bot', '<span class="loading-dots"></span>', true);

    try {
        const response = await fetch(`${WORKER_URL}?query=${encodeURIComponent(userMessage)}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP Error: ${response.status}`);
        }

        if (!response.headers.get('content-type')?.includes('text/event-stream')) {
            throw new Error('Unexpected response format');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let content = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop();

            for (const event of events) {
                const dataLine = event.split('\n').find(line => line.startsWith('data:'));
                if (!dataLine) continue;

                try {
                    const data = JSON.parse(dataLine.slice(5));
                    if (data.choices?.[0]?.delta?.content) {
                        content += data.choices[0].delta.content;
                        updateMessage(loadingMessage, formatText(content));
                        if (content && loadingMessage.querySelector('.loading-dots')) {
                            loadingMessage.querySelector('.loading-dots').remove();
                        }
                    }
                } catch (e) {
                    console.error('Parse error:', e);
                }
            }
        }

        if (!content) updateMessage(loadingMessage, '⚠️ No response received');

    } catch (error) {
        updateMessage(loadingMessage, `⚠️ Error: ${error.message}`);
    } finally {
        form.querySelector('button').disabled = false;
        input.focus();
    }
});

// Prevent Enter from adding a new line
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
    }
});

// Helper Functions
function addMessage(sender, text, isHTML = false) {
    const div = document.createElement('div');
    div.className = `message ${sender}`;

    if (sender === 'bot') {
        const icon = document.createElement('img');
        icon.src = 'https://raw.githubusercontent.com/TGrahamGit/venice-mso/refs/heads/main/icon.png';
        icon.alt = 'Bot Icon';
        icon.className = 'bot-icon';
        div.appendChild(icon);

        const content = document.createElement('div');
        content.className = 'message-content';
        isHTML ? content.innerHTML = text : content.textContent = text;
        div.appendChild(content);
    } else {
        isHTML ? div.innerHTML = text : div.textContent = text;
    }

    chatbox.appendChild(div);
    chatbox.scrollTop = chatbox.scrollHeight;
    return div;
}

function updateMessage(element, text) {
    const content = element.querySelector('.message-content');
    content.innerHTML = text;
    chatbox.scrollTop = chatbox.scrollHeight;
}

function formatText(text) {
    const lines = text.split('\n');
    let html = '';
    let inOrderedList = false;
    let inUnorderedList = false;
    let inCodeBlock = false;
    let inBlockquote = false;
    let listItems = [];
    let codeBlockContent = [];
    let blockquoteLines = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        // Code block handling
        if (line.startsWith('```')) {
            if (!inCodeBlock) {
                closePendingElements();
                inCodeBlock = true;
            } else {
                html += `<pre><code>${codeBlockContent.join('\n')}</code></pre>`;
                codeBlockContent = [];
                inCodeBlock = false;
            }
            continue;
        }
        if (inCodeBlock) {
            codeBlockContent.push(line);
            continue;
        }

        // Heading detection (#, ##, ###)
        if (line.match(/^#{1,3}\s/)) {
            closePendingElements();
            const level = line.match(/^#+/)[0].length;
            const content = line.replace(/^#+\s/, '');
            html += `<h${level}>${inlineFormat(content)}</h${level}>`;
            continue;
        }

        // Ordered list detection (1., 2.)
        if (line.match(/^\d+\.\s+/)) {
            if (!inOrderedList) closePendingElements();
            inOrderedList = true;
            inUnorderedList = false;
            listItems.push(`<li>${inlineFormat(line.replace(/^\d+\.\s+/, ''))}</li>`);
            continue;
        }

        // Unordered list detection (-, *)
        if (line.match(/^[-*]\s+/)) {
            if (!inUnorderedList) closePendingElements();
            inUnorderedList = true;
            inOrderedList = false;
            listItems.push(`<li>${inlineFormat(line.replace(/^[-*]\s+/, ''))}</li>`);
            continue;
        }

        // Blockquote detection (>)
        if (line.startsWith('>')) {
            if (!inBlockquote) closePendingElements();
            inBlockquote = true;
            blockquoteLines.push(inlineFormat(line.replace(/^>\s*/, '')));
            continue;
        }

        // End of structured content
        if (line && !inOrderedList && !inUnorderedList && !inBlockquote) {
            closePendingElements();
            html += `<p>${inlineFormat(line)}</p>`;
        } else if (!line && (inOrderedList || inUnorderedList || inBlockquote)) {
            closePendingElements();
        }
    }

    // Close any remaining elements
    closePendingElements();

    return html || text;

    function closePendingElements() {
        if (listItems.length) {
            html += (inOrderedList ? '<ol>' : '<ul>') + listItems.join('') + (inOrderedList ? '</ol>' : '</ul>');
            listItems = [];
            inOrderedList = false;
            inUnorderedList = false;
        }
        if (blockquoteLines.length) {
            html += `<blockquote>${blockquoteLines.join('<br>')}</blockquote>`;
            blockquoteLines = [];
            inBlockquote = false;
        }
    }

    function inlineFormat(text) {
        // Bold (**text** or __text__)
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/__(.*?)__/g, '<strong>$1</strong>');
        // Italic (*text* or _text_)
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/_(.*?)_/g, '<em>$1</em>');
        // Inline code (`text`)
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        // Links (basic URL detection)
        text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
        return text;
    }
}
