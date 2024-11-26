let guessedLanguages = [];
const map = L.map('map').setView([-60, 0], 1.4);
map.options.minZoom = 1.4;
map.options.maxZoom = 17;

L.esri.basemapLayer('Imagery').addTo(map);
L.esri.basemapLayer('ImageryLabels').addTo(map);

const info = L.control();

info.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'info');
    return this._div;
};

info.update = function (name) {
    this._div.innerHTML = name;
};

info.addTo(map);

const languageMarkers = [];
languages.forEach(language => {
    if (language.latitude == null || language.longitude == null) {
        return;
    }

    const marker = L.circleMarker([language.latitude, language.longitude], {
        radius: 5,
        color: 'red',
        fillColor: 'red',
        fillOpacity: 0.5,
        weight: 1,
    });

    marker.displayName = language.name;
    marker.languageName = language.name.toLowerCase();
    marker.alternateNames = language.alternate_names.map(name => name.toLowerCase());
    marker.isMatched = false;

    marker.on('mouseover', () => {
        if (marker.isMatched) {
            info.update(marker.displayName);
        }
    });

    marker.on('mouseout', () => {
        info.update(" ");
    });

    languageMarkers.push(marker);
    marker.addTo(map);
});

function processInput() {
    const inputBox = document.getElementById('inputBox');
    const searchText = inputBox.value.trim().toLowerCase();
    inputBox.value = '';

    if (!searchText) return;

    let matchFound = false;

    languageMarkers.forEach(marker => {
        if (
            !marker.isMatched &&
            (marker.languageName === searchText ||
                marker.alternateNames.includes(searchText))
        ) {
            matchFound = true;
            marker.isMatched = true;
            marker.setStyle({ color: 'green', fillColor: 'green' });
            marker.on('click', () => {
                const path = findPathToLanguage(languageTree, marker.displayName.toLowerCase());
                if (path) {
                    revealPathInTree(path);
                }
            });            

            revealLanguage(marker.languageName);
            guessedLanguages.push(marker.languageName);
        }
    });

    if (!matchFound) {
        inputBox.classList.add('shake');
        setTimeout(() => inputBox.classList.remove('shake'), 500);
    }
}

function giveUp() {
    languageMarkers.forEach(marker => {
        if (!marker.isMatched) {
            marker.isMatched = true;
            marker.setStyle({ color: 'orange', fillColor: 'orange' });
            marker.on('click', () => {
                const path = findPathToLanguage(languageTree, marker.displayName.toLowerCase());
                if (path) {
                    revealPathInTree(path);
                }
            });
            

            marker.on('mouseover', () => {
                info.update(marker.displayName);
            });
        }
    });

    revealAllLanguages();
}

function countRemainingLanguages(node) {
    if (node.level == 'language' && (!(guessedLanguages.includes(node.name.toLowerCase())))) {
        return 1;
    }
    let count = 0;
    if (node.children) {
        node.children.forEach(child => {
            count += countRemainingLanguages(child);
        });
    }
    return count;
}

function familySharesNameWithLanguage(familyName, children) {
    const familyParts = familyName.toLowerCase().split(/[\s\-]+/);
    const matchingLanguages = [];

    children.forEach(child => {
        if (child.level === 'language') {
            if (familyParts.includes(child.name.toLowerCase())) {
                matchingLanguages.push(child.name);
            }
        } else if (child.children) {
            const result = familySharesNameWithLanguage(familyName, child.children);
            matchingLanguages.push(...result[0]);
        }
    });

    return [matchingLanguages, matchingLanguages.length > 0]
}

function applyBlurToFamilies(node) {
    if (node.length == 429) {
        node.forEach(family => {
            applyBlurToFamilies(family)
        })
    }
    if (node.level === 'family' && node.children) {
        if (familySharesNameWithLanguage(node.name, node.children)[1]) {
            node.hasSharedName = true;
        }

        node.children.forEach(child => applyBlurToFamilies(child));
    }
}

function createTreeElement(node) {
    const li = document.createElement('li');
    let remainingLanguages = countRemainingLanguages(node);

    if (node.level === 'language') {
        li.textContent = node.name;
        li.classList.add('hidden');
        li.dataset.language = node.name.toLowerCase();
    } else {
        const arrowSpan = document.createElement('span');
        arrowSpan.textContent = '▶';
        arrowSpan.style.cursor = 'pointer';
        arrowSpan.style.marginRight = '5px';

        const contentSpan = document.createElement('span');
        contentSpan.textContent = `${node.name}`;

        const remainingSpan = document.createElement('span');
        remainingSpan.textContent = ` (${remainingLanguages})`

        li.appendChild(arrowSpan);
        li.appendChild(contentSpan);
        li.appendChild(remainingSpan)
        li.classList.add('family');
        li.dataset.family = node.name.toLowerCase();

        if (node.hasSharedName) {
            contentSpan.classList.add('blur');
        }
    }

    if (node.level === 'family' && node.children) {
        const childrenUl = document.createElement('ul');
        childrenUl.classList.add('hidden');

        node.children.forEach(child => {
            const childElement = createTreeElement(child);
            childrenUl.appendChild(childElement);
        });

        li.appendChild(childrenUl);

        li.querySelector('span').addEventListener('click', (event) => {
            event.stopPropagation();
            const isHidden = childrenUl.classList.toggle('hidden');
            li.querySelector('span').classList.toggle('expanded', !isHidden);
        });
    } else {
        li.addEventListener('click', (event) => {
            event.stopPropagation();
            const language = languages.find(lang => lang.name == node.name);
            map.flyTo(new L.LatLng(language.latitude - 0.3, language.longitude), 9);
        });
    }

    return li;
}

function calculateFamilyLanguageCount(node) {
    if (node.level === 'language') {
        return 1;
    }

    let count = 0;

    if (node.children) {
        node.children = node.children.map(child => ({
            ...child,
            count: calculateFamilyLanguageCount(child),
        })).sort((a, b) => b.count - a.count);

        count = node.children.reduce((sum, child) => sum + child.count, 0);
    }

    return count;
}

function buildLanguageTree() {
    const treeContainer = document.getElementById('languageTree');
    treeContainer.innerHTML = '';

    let isolateList = [];

    const familiesWithCounts = languageTree.map(rootNode => {
        if (rootNode.level === 'language') {
            isolateList.push(rootNode);
            return null;
        }

        const totalLanguages = calculateFamilyLanguageCount(rootNode);
        rootNode.count = totalLanguages;

        return rootNode;
    }).filter(Boolean);

    familiesWithCounts.sort((a, b) => b.count - a.count);

    familiesWithCounts.forEach(node => {
        treeContainer.appendChild(createTreeElement(node));
    });

    if (isolateList.length > 0) {
        const isolates = {
            name: 'Isolates',
            level: 'family',
            children: isolateList
        };
        treeContainer.appendChild(createTreeElement(isolates));
    }
}

function revealLanguage(languageName) {
    const treeItems = document.querySelectorAll('#languageTree li');

    treeItems.forEach(item => {
        if (item.dataset.language === languageName) {
            item.classList.remove('hidden');
            item.classList.add('revealed');

            let currentElement = item.parentElement;
            while (currentElement) {
                if (currentElement.tagName === 'UL') {
                    const parentFamilySpan = currentElement.previousElementSibling;
                    if (parentFamilySpan && parentFamilySpan.classList.contains('blur')) {
                        const childLanguages = currentElement.querySelectorAll('li');
                        console.log(childLanguages)
                        const allRevealed = Array.from(childLanguages).every(child =>
                            !child.classList.contains('hidden')
                        );

                        if (allRevealed) {
                            parentFamilySpan.classList.remove('blur');
                        }
                    }
                }
                currentElement = currentElement.parentElement.parentElement;
            }
        }
    });
}

function findNodeInTree(tree, name) {
    for (const node of tree) {
        if (node.name.toLowerCase() === name) {
            return node;
        }
        if (node.children) {
            const found = findNodeInTree(node.children, name);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

function revealAllLanguages() {
    const treeItems = document.querySelectorAll('#languageTree li');
    treeItems.forEach(item => {
        if (item.classList.contains('hidden')) {
            item.classList.remove('hidden');
            item.classList.add('fail');
        }
    });
}

function filterTree(tree, languages) {
    return tree
        .map(node => {
            if (node.children) {
                node.children = filterTree(node.children, languages);

                return node.children.length > 0 ? node : null;
            } else {
                const language = languages.find(lang => lang.name === node.name);

                return language && language.latitude == null ? null : node;
            }
        })
        .filter(node => node !== null);
}

function findPathToLanguage(tree, languageName) {
    for (const node of tree) {
        if (node.level === "language" && node.name.toLowerCase() === languageName) {
            return [node];
        }
        if (node.children) {
            const path = findPathToLanguage(node.children, languageName);
            if (path) {
                return [node, ...path];
            }
        }
    }
    return null;
}

function revealPathInTree(path) {
    let currentNode = document.getElementById('languageTree');
    let targetElement = null;

    path.forEach(node => {
        const li = Array.from(currentNode.querySelectorAll('li')).find(
            el => el.dataset.family === node.name.toLowerCase() || el.dataset.language === node.name.toLowerCase()
        );
        if (li) {
            li.classList.remove('hidden');
            const childrenUl = li.querySelector('ul');
            if (childrenUl) {
                childrenUl.classList.remove('hidden');
            } else {
                li.classList.add('revealed');
            }
            currentNode = childrenUl || currentNode;
            targetElement = li;
        }
    });

    if (targetElement) {
        targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }
}

let filteredTree = filterTree(languageTree, languages);
let langaugeTree = filteredTree;
applyBlurToFamilies(languageTree);
buildLanguageTree();
document.getElementById('submitButton').addEventListener('click', processInput);
document.getElementById('giveUpButton').addEventListener('click', giveUp);
document.getElementById('inputBox').addEventListener('keyup', event => {
    if (event.key === 'Enter') {
        processInput();
    }
});