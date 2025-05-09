// Основные переменные
let plotWidth = 0;
let plotLength = 0;
let plotElement = null;
let scaleFactor = 1;
let buildings = [];
let currentBuilding = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Цвета для разных типов построек
const buildingColors = {
    'house': 'rgba(66, 165, 245, 0.7)',
    'garage': 'rgba(169, 169, 169, 0.7)',
    'banya': 'rgba(244, 67, 54, 0.7)',
    'shed': 'rgba(255, 193, 7, 0.7)',
    'toilet': 'rgba(233, 30, 99, 0.7)',
    'well': 'rgba(0, 188, 212, 0.7)',
    'borehole': 'rgba(0, 150, 136, 0.7)',
    'boiler': 'rgba(156, 39, 176, 0.7)',
    'gazebo': 'rgba(76, 175, 80, 0.7)',
    'veranda': 'rgba(205, 220, 57, 0.7)',
    'parking': 'rgba(96, 125, 139, 0.7)'
};

// Счетчик построек по типам
const buildingCounts = {};

// Элементы DOM
const plotContainer = document.querySelector('.plot-container');
const plotControls = document.getElementById('plot-controls');
const buildingSection = document.getElementById('building-section');
const buildingSizeControls = document.getElementById('building-size-controls');
const rulesInfo = document.getElementById('rules-info');

// Инициализация
document.getElementById('create-plot').addEventListener('click', createPlot);
document.getElementById('building-type').addEventListener('change', showBuildingControls);
document.getElementById('create-building').addEventListener('click', createBuilding);
document.addEventListener('DOMContentLoaded', updateBuildingsLegend);

// Создание участка
function createPlot() {
    plotWidth = parseInt(document.getElementById('plot-width').value);
    plotLength = parseInt(document.getElementById('plot-length').value);
    
    if (plotWidth <= 0 || plotLength <= 0) {
        alert('Размеры участка должны быть положительными числами');
        return;
    }
    
    // Учитываем отступы при расчете масштаба
    const containerWidth = plotContainer.clientWidth; // Учитывает padding
    const containerHeight = plotContainer.clientHeight;
    
    const availableWidth = containerWidth - 80; // 40px с каждой стороны
    const availableHeight = containerHeight - 80;
    
    scaleFactor = Math.min(
        availableWidth / plotWidth,
        availableHeight / plotLength
    ) * 0.9;
    
    // Создание элемента участка
    plotElement = document.getElementById('plot');
    plotElement.style.width = (plotWidth * scaleFactor) + 'px';
    plotElement.style.height = (plotLength * scaleFactor) + 'px';
    
    // Центрирование с учетом отступов
    plotElement.style.left = containerWidth / 2 - (plotWidth * scaleFactor) / 2 + 'px';
    plotElement.style.top = '40px';
   


    document.querySelectorAll('#north-side, #east-side, #south-side, #west-side').forEach(select => {
        select.addEventListener('change', updatePlotBorders);
    });

    updatePlotBorders(); // Инициализируем границы при создании участка

    // Показываем дополнительные элементы управления
    buildingSection.style.display = 'block';
    rulesInfo.style.display = 'block';
    document.getElementById('building-section').style.display = 'block';
}

// Показываем элементы управления для выбранной постройки
function showBuildingControls() {
    buildingSizeControls.style.display = 'block';
}

// Создание постройки
function createBuilding() {
    const type = document.getElementById('building-type').value;

    // Проверяем, что тип выбран
    if (!type) {
        alert('Пожалуйста, выберите тип постройки');
        return;
    }

    // Обновляем счетчик
    buildingCounts[type] = (buildingCounts[type] || 0) + 1;
    updateBuildingsLegend();

    const width = parseInt(document.getElementById('building-width').value) / 100; // переводим в метры
    const length = parseInt(document.getElementById('building-length').value) / 100;
    
    if (width <= 0 || length <= 0) {
        alert('Размеры постройки должны быть положительными числами');
        return;
    }
    
    // Создаем элемент постройки
    const building = document.createElement('div');
    building.className = 'building';
    building.dataset.type = type;
    building.dataset.width = width;
    building.dataset.length = length;
    building.style.backgroundColor = buildingColors[type];
    building.style.borderColor = buildingColors[type].replace('0.7', '1');
    
    // Рассчет размеров в пикселях
    const pixelWidth = width * scaleFactor;
    const pixelLength = length * scaleFactor;
    
    building.style.width = pixelWidth + 'px';
    building.style.height = pixelLength + 'px';
    
    // Позиционируем рядом с участком
    const plotRect = plotElement.getBoundingClientRect();
    const containerRect = plotContainer.getBoundingClientRect();
    
    building.style.left = (plotRect.right - containerRect.left + 40) + 'px';
    building.style.top = (plotRect.top - containerRect.top) + 'px';

    // Создаем контейнер для постройки и подсказки
    const buildingContainer = document.createElement('div');
    buildingContainer.className = 'building-container';
    buildingContainer.style.position = 'absolute';
    buildingContainer.style.left = (plotRect.right - containerRect.left + 20) + 'px';
    buildingContainer.style.top = (plotRect.top - containerRect.top) + 'px';
    
    // Добавляем постройку в контейнер
    buildingContainer.appendChild(building);
    
    // Добавляем информацию о постройке
    const infoDiv = document.createElement('div');
    infoDiv.className = 'building-info';
    infoDiv.textContent = `${getBuildingName(type)} ${width.toFixed(1)}x${length.toFixed(1)}м`;
    building.appendChild(infoDiv);
    
    // Добавляем обработчики событий для перемещения
    building.addEventListener('mousedown', startDrag);
    building.addEventListener('mouseenter', () => {
        infoDiv.style.display = 'block';
    });
    building.addEventListener('mouseleave', () => {
        infoDiv.style.display = 'none';
    });
    
    plotContainer.appendChild(building);
    
    // Сохраняем информацию о постройке
    buildings.push({
        element: building,
        type: type,
        width: width,
        length: length,
        x: null,
        y: null
    });
    
    currentBuilding = building;
}

// Начало перемещения постройки
function startDrag(e) {
    if (e.button !== 0) return; // только левая кнопка мыши
    
    currentBuilding = e.currentTarget;
    isDragging = true;
    
    // Запоминаем смещение курсора относительно угла постройки
    const rect = currentBuilding.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    
    // Поднимаем элемент над остальными
    currentBuilding.style.zIndex = '100';
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
}

// Перемещение постройки
function drag(e) {
    if (!isDragging) return;
    
    // Позиционируем постройку относительно курсора
    const containerRect = plotContainer.getBoundingClientRect();
    let left = e.clientX - containerRect.left - dragOffsetX;
    let top = e.clientY - containerRect.top - dragOffsetY;
    
    // Ограничиваем перемещение в пределах контейнера
    left = Math.max(0, Math.min(left, containerRect.width - currentBuilding.offsetWidth));
    top = Math.max(0, Math.min(top, containerRect.height - currentBuilding.offsetHeight));
    
    currentBuilding.style.left = left + 'px';
    currentBuilding.style.top = top + 'px';
    
    // Проверяем расстояние до границ участка и других построек
    checkDistances();
}

// Окончание перемещения
function stopDrag() {
    if (!isDragging) return;
    
    isDragging = false;
    currentBuilding.style.zIndex = '10';
    
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
    
    // Обновляем координаты постройки
    const buildingIndex = buildings.findIndex(b => b.element === currentBuilding);
    if (buildingIndex !== -1) {
        buildings[buildingIndex].x = parseInt(currentBuilding.style.left);
        buildings[buildingIndex].y = parseInt(currentBuilding.style.top);
    }
}

// Проверка расстояний
function checkDistances() {
    // Удаляем старые линии расстояний
    document.querySelectorAll('.distance-line').forEach(el => el.remove());
    
    if (!currentBuilding) return;
    
    const plotRect = plotElement.getBoundingClientRect();
    const buildingRect = currentBuilding.getBoundingClientRect();
    const buildingData = buildings.find(b => b.element === currentBuilding);
    
    // Получаем позицию участка относительно контейнера
    const plotOffsetLeft = plotElement.offsetLeft;
    const plotOffsetTop = plotElement.offsetTop;
    
    // Проверяем расстояние до границ участка
    const leftDistance = (buildingRect.left - plotRect.left) / scaleFactor;
    const rightDistance = (plotRect.right - buildingRect.right) / scaleFactor;
    const topDistance = (buildingRect.top - plotRect.top) / scaleFactor;
    const bottomDistance = (plotRect.bottom - buildingRect.bottom) / scaleFactor;
    
    // Минимальные расстояния согласно нормам
    let minDistance = 1; // по умолчанию 1 м для хозпостроек
    
    if (buildingData.type === 'house') {
        minDistance = 3;
    } else if (buildingData.type === 'toilet' || buildingData.type === 'well') {
        minDistance = 8;
    }
    
    // Проверяем и отображаем расстояние до границ
    checkBorderDistance(leftDistance, 'left', minDistance, plotOffsetLeft, plotOffsetTop);
    checkBorderDistance(rightDistance, 'right', minDistance, plotOffsetLeft, plotOffsetTop);
    checkBorderDistance(topDistance, 'top', minDistance, plotOffsetLeft, plotOffsetTop);
    checkBorderDistance(bottomDistance, 'bottom', minDistance, plotOffsetLeft, plotOffsetTop);
    
    // Проверяем расстояние до других построек
    buildings.forEach(otherBuilding => {
        if (otherBuilding.element !== currentBuilding && otherBuilding.x !== null) {
            const otherRect = otherBuilding.element.getBoundingClientRect();
            
            // Рассчитываем расстояние между постройками
            const dx = Math.max(
                buildingRect.left - otherRect.right,
                otherRect.left - buildingRect.right,
                0
            );
            
            const dy = Math.max(
                buildingRect.top - otherRect.bottom,
                otherRect.top - buildingRect.bottom,
                0
            );
            
            const distance = Math.sqrt(dx*dx + dy*dy) / scaleFactor;
            
            // Минимальное расстояние между этими типами построек
            let requiredDistance = getRequiredDistance(buildingData.type, otherBuilding.type);
            
            // Координаты центров построек относительно контейнера
            const currentCenterX = currentBuilding.offsetLeft + currentBuilding.offsetWidth/2;
            const currentCenterY = currentBuilding.offsetTop + currentBuilding.offsetHeight/2;
            
            const otherCenterX = otherBuilding.element.offsetLeft + otherBuilding.element.offsetWidth/2;
            const otherCenterY = otherBuilding.element.offsetTop + otherBuilding.element.offsetHeight/2;
            
            // Создаем линию расстояния
            createDistanceLine(
                currentCenterX,
                currentCenterY,
                otherCenterX,
                otherCenterY,
                distance,
                requiredDistance
            );
        }
    });
}

// Проверка расстояния до границы участка
function checkBorderDistance(distance, side, minDistance, plotOffsetLeft, plotOffsetTop) {
    const buildingRect = {
        left: currentBuilding.offsetLeft,
        right: currentBuilding.offsetLeft + currentBuilding.offsetWidth,
        top: currentBuilding.offsetTop,
        bottom: currentBuilding.offsetTop + currentBuilding.offsetHeight
    };
    
    const plotRect = {
        left: plotOffsetLeft,
        right: plotOffsetLeft + plotElement.offsetWidth,
        top: plotOffsetTop,
        bottom: plotOffsetTop + plotElement.offsetHeight
    };
    
    let x1, y1, x2, y2;
    
    switch (side) {
        case 'left':
            x1 = plotRect.left;
            y1 = buildingRect.top + currentBuilding.offsetHeight/2;
            x2 = buildingRect.left;
            y2 = y1;
            break;
        case 'right':
            x1 = buildingRect.right;
            y1 = buildingRect.top + currentBuilding.offsetHeight/2;
            x2 = plotRect.right;
            y2 = y1;
            break;
        case 'top':
            x1 = buildingRect.left + currentBuilding.offsetWidth/2;
            y1 = plotRect.top;
            x2 = x1;
            y2 = buildingRect.top;
            break;
        case 'bottom':
            x1 = buildingRect.left + currentBuilding.offsetWidth/2;
            y1 = buildingRect.bottom;
            x2 = x1;
            y2 = plotRect.bottom;
            break;
    }
    
    createDistanceLine(x1, y1, x2, y2, distance, minDistance);
}

// Создание линии, показывающей расстояние
function createDistanceLine(x1, y1, x2, y2, actualDistance, requiredDistance) {
    const line = document.createElement('div');
    line.className = 'distance-line';
    
    // Рассчитываем середину линии для подписи
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    
    // Определяем цвет в зависимости от соблюдения расстояния
    const isOk = actualDistance >= requiredDistance;
    const color = isOk ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)';
    
    // Стили линии
    line.style.position = 'absolute';
    line.style.left = x1 + 'px';
    line.style.top = y1 + 'px';
    line.style.width = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2)) + 'px';
    line.style.height = '2px';
    line.style.backgroundColor = color;
    line.style.transformOrigin = '0 0';
    line.style.transform = `rotate(${Math.atan2(y2-y1, x2-x1)}rad)`;
    
    // Создаем подпись с расстоянием
    const label = document.createElement('div');
    label.textContent = `${actualDistance.toFixed(1)}м (мин. ${requiredDistance}м)`;
    label.style.position = 'absolute';
    label.style.left = '50%';
    label.style.top = '50%';
    label.style.backgroundColor = 'white';
    label.style.padding = '2px 5px';
    label.style.borderRadius = '3px';
    label.style.fontSize = '12px';
    label.style.transform = 'translate(-50%, -50%)';
    label.style.border = `1px solid ${isOk ? '#4CAF50' : '#F44336'}`;
    
    line.appendChild(label);
    plotContainer.appendChild(line);
}

// Получение требуемого расстояния между типами построек
function getRequiredDistance(type1, type2) {
    // Если хотя бы один объект - парковка, минимальное расстояние 0м
    if (type1 === 'parking' || type2 === 'parking') {
        return 0;
    }

    // Дом и другие постройки
    if ((type1 === 'house' || type2 === 'house')) {
        if (type1 === 'toilet' || type2 === 'toilet') return 8;
        if (type1 === 'banya' || type2 === 'banya') return 8;
        if (type1 === 'well' || type2 === 'well') return 8;
        return 3;
    }
    
    // Туалет и другие постройки
    if (type1 === 'toilet' || type2 === 'toilet') {
        if (type1 === 'well' || type2 === 'well') return 12;
        return 8;
    }
    
    // Баня и другие постройки
    if (type1 === 'banya' || type2 === 'banya') {
        return 1;
    }
    
    // По умолчанию 1 метр
    return 1;
}

// Получение читаемого имени постройки
function getBuildingName(type) {
    const names = {
        'house': 'Дом',
        'garage': 'Гараж',
        'banya': 'Баня',
        'shed': 'Сарай',
        'toilet': 'Туалет',
        'well': 'Колодец',
        'borehole': 'Скважина',
        'boiler': 'Котельная',
        'gazebo': 'Беседка',
        'veranda': 'Веранда',
        'parking': 'Парковка'
    };
    return names[type] || type;
}

function updatePlotBorders() {
    // Удаляем старые границы
    document.querySelectorAll('.plot-border').forEach(el => el.remove());
    
    if (!plotElement) return;
    
    // Получаем текущие размеры и позицию участка
    const plotLeft = plotElement.offsetLeft;
    const plotTop = plotElement.offsetTop;
    const plotWidth = plotElement.offsetWidth;
    const plotHeight = plotElement.offsetHeight;
    
    // Устанавливаем CSS переменные
    plotContainer.style.setProperty('--plot-left', plotLeft + 'px');
    plotContainer.style.setProperty('--plot-top', plotTop + 'px');
    plotContainer.style.setProperty('--plot-width', plotWidth + 'px');
    plotContainer.style.setProperty('--plot-height', plotHeight + 'px');
    plotContainer.style.setProperty('--border-thickness', '30px');
    
    // Получаем выбранные типы границ
    const northType = document.getElementById('north-side').value;
    const eastType = document.getElementById('east-side').value;
    const southType = document.getElementById('south-side').value;
    const westType = document.getElementById('west-side').value;
    
    // Создаем границы с учетом толщины
    if (northType) createBorder('north', northType);
    if (eastType) createBorder('east', eastType);
    if (southType) createBorder('south', southType);
    if (westType) createBorder('west', westType);
    
    // Проверяем, чтобы границы не выходили за пределы контейнера
    adjustBordersPosition();
}

function adjustBordersPosition() {
    const borders = document.querySelectorAll('.plot-border');
    const containerRect = plotContainer.getBoundingClientRect();
    const borderThickness = 30;

    borders.forEach(border => {
        const rect = border.getBoundingClientRect();
        
        // Корректировка для левой границы
        if (border.classList.contains('west-border')) {
            const newLeft = Math.max(containerRect.left, rect.left);
            border.style.left = (newLeft - containerRect.left - 1) + 'px'; // Учитываем сдвиг
        }
        
        // Корректировка для верхней границы
        if (border.classList.contains('north-border')) {
            const newTop = Math.max(containerRect.top, rect.top);
            border.style.top = (newTop - containerRect.top) + 'px';
         //   border.style.left = '-1px'; // Дополнительный сдвиг
        }
    });
}

function createBorder(side, type) {
    const border = document.createElement('div');
    border.className = `plot-border ${side}-border border-${type}`;
    
    // Подписи для границ
    const labels = {
        road: 'Дорога',
        forest: 'Лес',
        neighbor: 'Сосед',
        ditch: 'Канава'
    };
    
    border.textContent = labels[type];
    plotContainer.appendChild(border);
}

function updateBuildingsLegend() {
    const legendContent = document.getElementById('legend-content');
    legendContent.innerHTML = '';
    
    for (const [type, color] of Object.entries(buildingColors)) {
        const count = buildingCounts[type] || 0;
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.dataset.type = type;
        item.innerHTML = `
            <div class="legend-color" style="background-color: ${color}; border-color: ${color.replace('0.7', '1')}"></div>
            <div class="legend-name">${getBuildingName(type)}</div>
            <div class="legend-count">${count}</div>
        `;
        
        // Добавляем обработчик для выделения построек
        item.addEventListener('click', () => highlightBuildings(type));
        
        legendContent.appendChild(item);
    }
}

function highlightBuildings(type) {
    // Снимаем выделение со всех построек
    document.querySelectorAll('.building').forEach(b => {
        b.style.boxShadow = 'none';
    });
    
    // Выделяем постройки выбранного типа
    if (type) {
        document.querySelectorAll(`.building[data-type="${type}"]`).forEach(b => {
            b.style.boxShadow = `0 0 0 2px ${buildingColors[type].replace('0.7', '1')}`;
        });
    }
}
