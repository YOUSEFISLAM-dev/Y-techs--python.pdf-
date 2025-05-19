// Global variables
let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.0;
let rotation = 0;
let pdfCanvas = document.getElementById('pdf-canvas');
let ctx = pdfCanvas.getContext('2d');
let currentPdfFile = null;
let totalPages = 0;
let activeToolButton = null;
let activeTool = null;
let annotations = {};
let currentAnnotation = null;
let isDrawing = false;
let propertiesPanelActive = false;
let colorPickerActive = false;
let selectedColor = '#FF0000'; // Default color: red

// Initialize the PDF.js library when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
});

// Initialize all event listeners
function initEventListeners() {
    // PDF file opening
    document.getElementById('open-pdf').addEventListener('click', () => {
        document.getElementById('pdf-file').click();
    });
    
    document.getElementById('open-pdf-empty').addEventListener('click', () => {
        document.getElementById('pdf-file').click();
    });
    
    document.getElementById('pdf-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            openPdfFile(file);
        }
    });
    
    // Navigation buttons
    document.getElementById('prev-page').addEventListener('click', () => {
        if (pageNum <= 1) return;
        pageNum--;
        queueRenderPage(pageNum);
        updatePageInfo();
    });
    
    document.getElementById('next-page').addEventListener('click', () => {
        if (pageNum >= totalPages) return;
        pageNum++;
        queueRenderPage(pageNum);
        updatePageInfo();
    });
    
    // Zoom buttons
    document.getElementById('zoom-in').addEventListener('click', () => {
        scale *= 1.2;
        queueRenderPage(pageNum);
        updateZoomInfo();
    });
    
    document.getElementById('zoom-out').addEventListener('click', () => {
        scale /= 1.2;
        queueRenderPage(pageNum);
        updateZoomInfo();
    });
    
    // Fit buttons
    document.getElementById('fit-to-width').addEventListener('click', fitToWidth);
    document.getElementById('fit-to-page').addEventListener('click', fitToPage);
    
    // Rotation buttons
    document.getElementById('rotate-cw').addEventListener('click', () => {
        rotation = (rotation + 90) % 360;
        queueRenderPage(pageNum);
    });
    
    document.getElementById('rotate-ccw').addEventListener('click', () => {
        rotation = (rotation - 90 + 360) % 360;
        queueRenderPage(pageNum);
    });
    
    // Tool buttons
    const toolButtons = document.querySelectorAll('.tool-btn');
    toolButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            if (activeToolButton) {
                activeToolButton.classList.remove('active');
            }
            
            button.classList.add('active');
            activeToolButton = button;
            activeTool = button.id;
            
            // Show properties panel for annotation tools
            if (['text-tool', 'highlight-tool', 'draw-tool', 'shape-tool'].includes(activeTool)) {
                showPropertiesPanel();
                populatePropertiesForTool(activeTool);
            } else {
                hidePropertiesPanel();
            }
            
            // Handle specific tool activations
            handleToolActivation(activeTool);
        });
    });
    
    // Print button
    document.getElementById('print-pdf').addEventListener('click', printPdf);
    
    // Save button
    document.getElementById('save-pdf').addEventListener('click', savePdf);
    
    // Modal close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    
    // Modal cancel
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    
    // Properties panel close button
    document.querySelector('.close-panel').addEventListener('click', hidePropertiesPanel);
    
    // Color picker events
    document.querySelector('.close-color-picker').addEventListener('click', hideColorPicker);
    
    const colorPresets = document.querySelectorAll('.color-preset');
    colorPresets.forEach(preset => {
        preset.addEventListener('click', () => {
            selectedColor = preset.style.backgroundColor;
            hideColorPicker();
            updatePropertiesPanel();
        });
    });
    
    document.getElementById('custom-color-input').addEventListener('change', (e) => {
        selectedColor = e.target.value;
        hideColorPicker();
        updatePropertiesPanel();
    });
    
    // Drawing events
    pdfCanvas.addEventListener('mousedown', handleCanvasMouseDown);
    pdfCanvas.addEventListener('mousemove', handleCanvasMouseMove);
    pdfCanvas.addEventListener('mouseup', handleCanvasMouseUp);
    pdfCanvas.addEventListener('mouseleave', handleCanvasMouseUp);
}

// Functions for PDF opening and rendering
async function openPdfFile(file) {
    // Show loading state
    document.getElementById('pdf-container').innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin fa-3x"></i><p>Loading PDF...</p></div>';
    
    currentPdfFile = file;
    
    // Read the file
    const fileReader = new FileReader();
    fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        
        try {
            // Load the PDF document
            const loadingTask = pdfjsLib.getDocument({data: typedarray});
            pdfDoc = await loadingTask.promise;
            totalPages = pdfDoc.numPages;
            
            // Reset to first page
            pageNum = 1;
            scale = 1.0;
            rotation = 0;
            
            // Create canvas element
            document.getElementById('pdf-container').innerHTML = '';
            const canvas = document.createElement('canvas');
            canvas.id = 'pdf-canvas';
            document.getElementById('pdf-container').appendChild(canvas);
            pdfCanvas = canvas;
            ctx = canvas.getContext('2d');
            
            // Create text and annotation layers
            const textLayer = document.createElement('div');
            textLayer.id = 'text-layer';
            document.getElementById('pdf-container').appendChild(textLayer);
            
            const annotationLayer = document.createElement('div');
            annotationLayer.id = 'annotation-layer';
            document.getElementById('pdf-container').appendChild(annotationLayer);
            
            // Initial rendering
            renderPage(pageNum);
            
            // Generate thumbnails
            generateThumbnails();
            
            // Update UI
            updatePageInfo();
            updateFileInfo();
            
            // Enable buttons
            enableButtons();
            
            // Setup canvas events
            setupCanvasEvents();
            
        } catch (error) {
            console.error('Error while loading document:', error);
            document.getElementById('pdf-container').innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle fa-3x"></i><h2>Error loading PDF</h2><p>' + error.message + '</p></div>';
        }
    };
    
    fileReader.readAsArrayBuffer(file);
}

// Render the page
function renderPage(num) {
    pageRendering = true;
    
    // Update page info
    document.getElementById('current-page').textContent = num;
    
    // Use the promise to fetch the page
    pdfDoc.getPage(num).then(function(page) {
        // Calculate viewport
        const viewport = page.getViewport({ scale: scale, rotation: rotation });
        
        // Set canvas height and width to match the viewport
        pdfCanvas.height = viewport.height;
        pdfCanvas.width = viewport.width;
        
        // Render PDF page into canvas context
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        const renderTask = page.render(renderContext);
        
        // Wait for rendering to finish
        renderTask.promise.then(function() {
            pageRendering = false;
            
            // Render text layer
            return page.getTextContent().then(function(textContent) {
                const textLayer = document.getElementById('text-layer');
                textLayer.innerHTML = '';
                textLayer.style.left = pdfCanvas.offsetLeft + 'px';
                textLayer.style.top = pdfCanvas.offsetTop + 'px';
                textLayer.style.height = pdfCanvas.height + 'px';
                textLayer.style.width = pdfCanvas.width + 'px';
                
                pdfjsLib.renderTextLayer({
                    textContent: textContent,
                    container: textLayer,
                    viewport: viewport,
                    textDivs: []
                });
                
                // If another page rendering is pending, process it
                if (pageNumPending !== null) {
                    renderPage(pageNumPending);
                    pageNumPending = null;
                }
                
                // Render annotations
                renderAnnotations(num);
            });
        }).catch(function(error) {
            console.error('Error rendering page:', error);
            pageRendering = false;
            
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });
    });
}

// Queue rendering of a page if another is in progress
function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// Update page info in the UI
function updatePageInfo() {
    document.getElementById('current-page').textContent = pageNum;
    document.getElementById('page-count').textContent = totalPages;
    
    // Update thumbnail selection
    const thumbnails = document.querySelectorAll('.page-thumbnail');
    thumbnails.forEach((thumbnail, index) => {
        if (index + 1 === pageNum) {
            thumbnail.classList.add('active');
        } else {
            thumbnail.classList.remove('active');
        }
    });
}

// Update zoom info in the UI
function updateZoomInfo() {
    const zoomPercent = Math.round(scale * 100);
    document.getElementById('zoom-level').textContent = `${zoomPercent}%`;
    document.getElementById('zoom-info').textContent = `Zoom: ${zoomPercent}%`;
}

// Update file info in the UI
function updateFileInfo() {
    if (currentPdfFile) {
        document.getElementById('file-info').textContent = `File: ${currentPdfFile.name} (${formatFileSize(currentPdfFile.size)})`;
    } else {
        document.getElementById('file-info').textContent = 'No file loaded';
    }
}

// Enable buttons once a PDF is loaded
function enableButtons() {
    const buttons = ['prev-page', 'next-page', 'zoom-in', 'zoom-out', 
                     'rotate-cw', 'rotate-ccw', 'save-pdf', 'print-pdf'];
    
    buttons.forEach(id => {
        document.getElementById(id).disabled = false;
    });
}

// Generate thumbnails for all pages
async function generateThumbnails() {
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    thumbnailsContainer.innerHTML = '';
    
    // Create thumbnails for each page
    for (let i = 1; i <= totalPages; i++) {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'page-thumbnail';
        if (i === pageNum) thumbnail.classList.add('active');
        
        // Create canvas for thumbnail
        const canvas = document.createElement('canvas');
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.2, rotation: 0 });
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
            canvasContext: canvas.getContext('2d'),
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        thumbnail.appendChild(canvas);
        thumbnail.dataset.pageNum = i;
        
        // Add click event to navigate to the page
        thumbnail.addEventListener('click', () => {
            pageNum = parseInt(thumbnail.dataset.pageNum);
            queueRenderPage(pageNum);
            updatePageInfo();
        });
        
        thumbnailsContainer.appendChild(thumbnail);
    }
}

// Fit the PDF to the width of the container
function fitToWidth() {
    if (!pdfDoc) return;
    
    pdfDoc.getPage(pageNum).then(page => {
        const container = document.querySelector('.document-area');
        const viewport = page.getViewport({ scale: 1, rotation: rotation });
        const containerWidth = container.clientWidth - 40; // Subtract padding
        
        scale = containerWidth / viewport.width;
        queueRenderPage(pageNum);
        updateZoomInfo();
    });
}

// Fit the PDF to show the entire page
function fitToPage() {
    if (!pdfDoc) return;
    
    pdfDoc.getPage(pageNum).then(page => {
        const container = document.querySelector('.document-area');
        const viewport = page.getViewport({ scale: 1, rotation: rotation });
        const containerWidth = container.clientWidth - 40; // Subtract padding
        const containerHeight = container.clientHeight - 40; // Subtract padding
        
        const scaleX = containerWidth / viewport.width;
        const scaleY = containerHeight / viewport.height;
        
        // Use the smaller scale to ensure the entire page fits
        scale = Math.min(scaleX, scaleY);
        queueRenderPage(pageNum);
        updateZoomInfo();
    });
}

// Format file size in a human-readable format
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Annotation Management
function renderAnnotations(pageNumber) {
    const annotationLayer = document.getElementById('annotation-layer');
    annotationLayer.innerHTML = '';
    annotationLayer.style.left = pdfCanvas.offsetLeft + 'px';
    annotationLayer.style.top = pdfCanvas.offsetTop + 'px';
    annotationLayer.style.height = pdfCanvas.height + 'px';
    annotationLayer.style.width = pdfCanvas.width + 'px';
    
    // Render saved annotations for this page
    if (annotations[pageNumber]) {
        annotations[pageNumber].forEach(annotation => {
            switch (annotation.type) {
                case 'text':
                    renderTextAnnotation(annotation);
                    break;
                case 'highlight':
                    renderHighlightAnnotation(annotation);
                    break;
                case 'draw':
                    renderDrawAnnotation(annotation);
                    break;
                case 'shape':
                    renderShapeAnnotation(annotation);
                    break;
            }
        });
    }
}

function handleToolActivation(tool) {
    // Clear any active drawing actions
    isDrawing = false;
    currentAnnotation = null;
    
    // Set cursor based on tool
    switch (tool) {
        case 'text-tool':
            pdfCanvas.style.cursor = 'text';
            break;
        case 'highlight-tool':
            pdfCanvas.style.cursor = 'crosshair';
            break;
        case 'draw-tool':
            pdfCanvas.style.cursor = 'crosshair';
            break;
        case 'shape-tool':
            pdfCanvas.style.cursor = 'crosshair';
            break;
        default:
            pdfCanvas.style.cursor = 'default';
    }
}

function setupCanvasEvents() {
    pdfCanvas.addEventListener('mousedown', handleCanvasMouseDown);
    pdfCanvas.addEventListener('mousemove', handleCanvasMouseMove);
    pdfCanvas.addEventListener('mouseup', handleCanvasMouseUp);
}

function handleCanvasMouseDown(e) {
    if (!activeTool) return;
    
    const rect = pdfCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    switch (activeTool) {
        case 'text-tool':
            addTextAnnotation(x, y);
            break;
        case 'highlight-tool':
            startHighlightAnnotation(x, y);
            break;
        case 'draw-tool':
            startDrawAnnotation(x, y);
            break;
        case 'shape-tool':
            startShapeAnnotation(x, y);
            break;
    }
}

function handleCanvasMouseMove(e) {
    if (!isDrawing || !currentAnnotation) return;
    
    const rect = pdfCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    switch (currentAnnotation.type) {
        case 'highlight':
            updateHighlightAnnotation(x, y);
            break;
        case 'draw':
            updateDrawAnnotation(x, y);
            break;
        case 'shape':
            updateShapeAnnotation(x, y);
            break;
    }
}

function handleCanvasMouseUp() {
    if (!isDrawing || !currentAnnotation) return;
    
    // Finish the current annotation
    finishAnnotation();
}

// Text Annotation Functions
function addTextAnnotation(x, y) {
    // Create a text input element
    const textInput = document.createElement('div');
    textInput.contentEditable = true;
    textInput.className = 'text-annotation';
    textInput.style.position = 'absolute';
    textInput.style.left = x + 'px';
    textInput.style.top = y + 'px';
    textInput.style.minWidth = '100px';
    textInput.style.minHeight = '30px';
    textInput.style.padding = '5px';
    textInput.style.background = 'rgba(255, 255, 255, 0.8)';
    textInput.style.border = '1px solid ' + selectedColor;
    textInput.style.color = selectedColor;
    textInput.style.fontFamily = 'Arial';
    textInput.style.fontSize = '14px';
    textInput.style.zIndex = '10';
    textInput.style.cursor = 'text';
    textInput.style.resize = 'both';
    textInput.style.overflow = 'auto';
    textInput.style.borderRadius = '3px';
    
    // Focus the input after adding it
    document.getElementById('annotation-layer').appendChild(textInput);
    textInput.focus();
    
    // Handle input completion
    textInput.addEventListener('blur', function() {
        const text = textInput.innerText.trim();
        
        if (text) {
            // Save the annotation
            if (!annotations[pageNum]) {
                annotations[pageNum] = [];
            }
            
            annotations[pageNum].push({
                type: 'text',
                x: parseInt(textInput.style.left),
                y: parseInt(textInput.style.top),
                width: textInput.offsetWidth,
                height: textInput.offsetHeight,
                text: text,
                color: selectedColor,
                fontSize: parseInt(textInput.style.fontSize),
                fontFamily: textInput.style.fontFamily
            });
            
            // Replace with styled div
            renderTextAnnotation(annotations[pageNum][annotations[pageNum].length - 1]);
        }
        
        // Remove the input element
        textInput.remove();
    });
    
    // Handle key events
    textInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            textInput.blur(); // Cancel on Escape
            textInput.remove();
        }
    });
}

function renderTextAnnotation(annotation) {
    const textElement = document.createElement('div');
    textElement.className = 'text-annotation';
    textElement.style.position = 'absolute';
    textElement.style.left = annotation.x + 'px';
    textElement.style.top = annotation.y + 'px';
    textElement.style.width = annotation.width + 'px';
    textElement.style.height = annotation.height + 'px';
    textElement.style.padding = '5px';
    textElement.style.background = 'rgba(255, 255, 255, 0.8)';
    textElement.style.border = '1px solid ' + annotation.color;
    textElement.style.color = annotation.color;
    textElement.style.fontFamily = annotation.fontFamily || 'Arial';
    textElement.style.fontSize = (annotation.fontSize || 14) + 'px';
    textElement.style.zIndex = '10';
    textElement.style.borderRadius = '3px';
    textElement.style.overflow = 'hidden';
    textElement.innerText = annotation.text;
    
    document.getElementById('annotation-layer').appendChild(textElement);
    
    // Make it editable on double click
    textElement.addEventListener('dblclick', function() {
        // Replace with editable input
        textElement.remove();
        addTextAnnotation(annotation.x, annotation.y);
    });
}

// Highlight Annotation Functions
function startHighlightAnnotation(x, y) {
    isDrawing = true;
    currentAnnotation = {
        type: 'highlight',
        x: x,
        y: y,
        width: 0,
        height: 0,
        color: selectedColor,
        opacity: 0.3
    };
    
    // Create visual element
    const highlight = document.createElement('div');
    highlight.className = 'highlight-annotation temp-annotation';
    highlight.style.position = 'absolute';
    highlight.style.left = x + 'px';
    highlight.style.top = y + 'px';
    highlight.style.background = selectedColor;
    highlight.style.opacity = '0.3';
    highlight.style.zIndex = '5';
    document.getElementById('annotation-layer').appendChild(highlight);
}

function updateHighlightAnnotation(x, y) {
    if (!currentAnnotation) return;
    
    const highlight = document.querySelector('.temp-annotation');
    const width = x - currentAnnotation.x;
    const height = y - currentAnnotation.y;
    
    if (width > 0) {
        highlight.style.width = width + 'px';
        currentAnnotation.width = width;
    } else {
        highlight.style.left = x + 'px';
        highlight.style.width = -width + 'px';
        currentAnnotation.x = x;
        currentAnnotation.width = -width;
    }
    
    if (height > 0) {
        highlight.style.height = height + 'px';
        currentAnnotation.height = height;
    } else {
        highlight.style.top = y + 'px';
        highlight.style.height = -height + 'px';
        currentAnnotation.y = y;
        currentAnnotation.height = -height;
    }
}

function renderHighlightAnnotation(annotation) {
    const highlight = document.createElement('div');
    highlight.className = 'highlight-annotation';
    highlight.style.position = 'absolute';
    highlight.style.left = annotation.x + 'px';
    highlight.style.top = annotation.y + 'px';
    highlight.style.width = annotation.width + 'px';
    highlight.style.height = annotation.height + 'px';
    highlight.style.background = annotation.color;
    highlight.style.opacity = annotation.opacity || '0.3';
    highlight.style.zIndex = '5';
    
    document.getElementById('annotation-layer').appendChild(highlight);
}

// Draw Annotation Functions
function startDrawAnnotation(x, y) {
    isDrawing = true;
    currentAnnotation = {
        type: 'draw',
        points: [{x: x, y: y}],
        color: selectedColor,
        lineWidth: 2
    };
    
    // Create SVG element if it doesn't exist
    let svgElement = document.querySelector('.draw-annotation-svg');
    if (!svgElement) {
        svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgElement.classList.add('draw-annotation-svg');
        svgElement.style.position = 'absolute';
        svgElement.style.left = '0';
        svgElement.style.top = '0';
        svgElement.style.width = '100%';
        svgElement.style.height = '100%';
        svgElement.style.zIndex = '6';
        document.getElementById('annotation-layer').appendChild(svgElement);
    }
    
    // Create path element
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('temp-path');
    path.setAttribute('stroke', selectedColor);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('d', `M${x},${y}`);
    
    svgElement.appendChild(path);
}

function updateDrawAnnotation(x, y) {
    if (!currentAnnotation) return;
    
    // Add point to the path
    currentAnnotation.points.push({x: x, y: y});
    
    // Update the SVG path
    const path = document.querySelector('.temp-path');
    let d = path.getAttribute('d');
    d += ` L${x},${y}`;
    path.setAttribute('d', d);
}

function renderDrawAnnotation(annotation) {
    // Make sure SVG element exists
    let svgElement = document.querySelector('.draw-annotation-svg');
    if (!svgElement) {
        svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgElement.classList.add('draw-annotation-svg');
        svgElement.style.position = 'absolute';
        svgElement.style.left = '0';
        svgElement.style.top = '0';
        svgElement.style.width = '100%';
        svgElement.style.height = '100%';
        svgElement.style.zIndex = '6';
        document.getElementById('annotation-layer').appendChild(svgElement);
    }
    
    // Create path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', annotation.color);
    path.setAttribute('stroke-width', annotation.lineWidth || '2');
    path.setAttribute('fill', 'none');
    
    // Create path data
    let d = `M${annotation.points[0].x},${annotation.points[0].y}`;
    for (let i = 1; i < annotation.points.length; i++) {
        d += ` L${annotation.points[i].x},${annotation.points[i].y}`;
    }
    
    path.setAttribute('d', d);
    svgElement.appendChild(path);
}

// Shape Annotation Functions
function startShapeAnnotation(x, y) {
    isDrawing = true;
    currentAnnotation = {
        type: 'shape',
        x: x,
        y: y,
        width: 0,
        height: 0,
        color: selectedColor,
        shape: 'rectangle', // Default shape
        lineWidth: 2,
        fill: false
    };
    
    // Create SVG element if it doesn't exist
    let svgElement = document.querySelector('.shape-annotation-svg');
    if (!svgElement) {
        svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgElement.classList.add('shape-annotation-svg');
        svgElement.style.position = 'absolute';
        svgElement.style.left = '0';
        svgElement.style.top = '0';
        svgElement.style.width = '100%';
        svgElement.style.height = '100%';
        svgElement.style.zIndex = '7';
        document.getElementById('annotation-layer').appendChild(svgElement);
    }
    
    // Create shape element
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shape.classList.add('temp-shape');
    shape.setAttribute('x', x);
    shape.setAttribute('y', y);
    shape.setAttribute('width', '0');
    shape.setAttribute('height', '0');
    shape.setAttribute('stroke', selectedColor);
    shape.setAttribute('stroke-width', '2');
    shape.setAttribute('fill', 'none');
    
    svgElement.appendChild(shape);
}

function updateShapeAnnotation(x, y) {
    if (!currentAnnotation) return;
    
    const shape = document.querySelector('.temp-shape');
    const width = x - currentAnnotation.x;
    const height = y - currentAnnotation.y;
    
    if (width > 0) {
        shape.setAttribute('width', width);
        currentAnnotation.width = width;
    } else {
        shape.setAttribute('x', x);
        shape.setAttribute('width', -width);
        currentAnnotation.x = x;
        currentAnnotation.width = -width;
    }
    
    if (height > 0) {
        shape.setAttribute('height', height);
        currentAnnotation.height = height;
    } else {
        shape.setAttribute('y', y);
        shape.setAttribute('height', -height);
        currentAnnotation.y = y;
        currentAnnotation.height = -height;
    }
}

function renderShapeAnnotation(annotation) {
    // Make sure SVG element exists
    let svgElement = document.querySelector('.shape-annotation-svg');
    if (!svgElement) {
        svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgElement.classList.add('shape-annotation-svg');
        svgElement.style.position = 'absolute';
        svgElement.style.left = '0';
        svgElement.style.top = '0';
        svgElement.style.width = '100%';
        svgElement.style.height = '100%';
        svgElement.style.zIndex = '7';
        document.getElementById('annotation-layer').appendChild(svgElement);
    }
    
    let shape;
    
    // Create appropriate SVG element based on shape type
    switch (annotation.shape) {
        case 'rectangle':
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            shape.setAttribute('x', annotation.x);
            shape.setAttribute('y', annotation.y);
            shape.setAttribute('width', annotation.width);
            shape.setAttribute('height', annotation.height);
            break;
        case 'ellipse':
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
            shape.setAttribute('cx', annotation.x + annotation.width / 2);
            shape.setAttribute('cy', annotation.y + annotation.height / 2);
            shape.setAttribute('rx', annotation.width / 2);
            shape.setAttribute('ry', annotation.height / 2);
            break;
        case 'line':
            shape = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            shape.setAttribute('x1', annotation.x);
            shape.setAttribute('y1', annotation.y);
            shape.setAttribute('x2', annotation.x + annotation.width);
            shape.setAttribute('y2', annotation.y + annotation.height);
            break;
    }
    
    shape.setAttribute('stroke', annotation.color);
    shape.setAttribute('stroke-width', annotation.lineWidth || '2');
    shape.setAttribute('fill', annotation.fill ? annotation.color : 'none');
    if (!annotation.fill) {
        shape.setAttribute('fill-opacity', '0.2');
    }
    
    svgElement.appendChild(shape);
}

function finishAnnotation() {
    if (!currentAnnotation) return;
    
    // Remove temporary annotation elements
    const tempElements = document.querySelectorAll('.temp-annotation, .temp-path, .temp-shape');
    tempElements.forEach(element => element.remove());
    
    // Save the completed annotation
    if (currentAnnotation.type === 'highlight' || 
        currentAnnotation.type === 'shape') {
        // Only save if it has some size
        if (currentAnnotation.width > 5 && currentAnnotation.height > 5) {
            saveAnnotation();
        }
    } else if (currentAnnotation.type === 'draw') {
        // Only save if it has multiple points
        if (currentAnnotation.points.length > 1) {
            saveAnnotation();
        }
    }
    
    // Reset drawing state
    isDrawing = false;
    currentAnnotation = null;
}

function saveAnnotation() {
    // Initialize annotations array for this page if it doesn't exist
    if (!annotations[pageNum]) {
        annotations[pageNum] = [];
    }
    
    // Add the annotation to the page
    annotations[pageNum].push(currentAnnotation);
    
    // Re-render all annotations
    renderAnnotations(pageNum);
}

// UI Panel Management
function showPropertiesPanel() {
    const panel = document.getElementById('properties-panel');
    panel.classList.add('active');
    propertiesPanelActive = true;
}

function hidePropertiesPanel() {
    const panel = document.getElementById('properties-panel');
    panel.classList.remove('active');
    propertiesPanelActive = false;
}

function populatePropertiesForTool(tool) {
    const propertiesForm = document.querySelector('.properties-form');
    
    // Clear existing content
    propertiesForm.innerHTML = '';
    
    // Create appropriate properties controls based on tool
    switch (tool) {
        case 'text-tool':
            propertiesForm.innerHTML = `
                <div class="form-group">
                    <label>Text Color</label>
                    <div class="color-display" style="background-color: ${selectedColor};" onclick="showColorPicker(event)"></div>
                </div>
                <div class="form-group">
                    <label>Font Size</label>
                    <select class="form-control" id="font-size-select">
                        <option value="10">10px</option>
                        <option value="12">12px</option>
                        <option value="14" selected>14px</option>
                        <option value="16">16px</option>
                        <option value="18">18px</option>
                        <option value="20">20px</option>
                        <option value="24">24px</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Font Family</label>
                    <select class="form-control" id="font-family-select">
                        <option value="Arial" selected>Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier New">Courier New</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Verdana">Verdana</option>
                    </select>
                </div>
            `;
            break;
        case 'highlight-tool':
            propertiesForm.innerHTML = `
                <div class="form-group">
                    <label>Highlight Color</label>
                    <div class="color-display" style="background-color: ${selectedColor};" onclick="showColorPicker(event)"></div>
                </div>
                <div class="form-group">
                    <label>Opacity</label>
                    <input type="range" min="10" max="80" value="30" class="form-control" id="opacity-range">
                </div>
            `;
            break;
        case 'draw-tool':
            propertiesForm.innerHTML = `
                <div class="form-group">
                    <label>Line Color</label>
                    <div class="color-display" style="background-color: ${selectedColor};" onclick="showColorPicker(event)"></div>
                </div>
                <div class="form-group">
                    <label>Line Width</label>
                    <input type="range" min="1" max="10" value="2" class="form-control" id="line-width-range">
                </div>
            `;
            break;
        case 'shape-tool':
            propertiesForm.innerHTML = `
                <div class="form-group">
                    <label>Shape Type</label>
                    <select class="form-control" id="shape-type-select">
                        <option value="rectangle" selected>Rectangle</option>
                        <option value="ellipse">Ellipse</option>
                        <option value="line">Line</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Line Color</label>
                    <div class="color-display" style="background-color: ${selectedColor};" onclick="showColorPicker(event)"></div>
                </div>
                <div class="form-group">
                    <label>Line Width</label>
                    <input type="range" min="1" max="10" value="2" class="form-control" id="shape-line-width-range">
                </div>
                <div class="form-group">
                    <label>Fill Shape</label>
                    <input type="checkbox" id="fill-shape-checkbox">
                </div>
            `;
            break;
    }
    
    // Add color display click listener
    const colorDisplays = document.querySelectorAll('.color-display');
    colorDisplays.forEach(display => {
        display.addEventListener('click', (e) => {
            showColorPicker(e);
        });
    });
    
    // Add event listeners to controls
    setTimeout(() => {
        // This needs to be done after the DOM is updated
        addPropertyControlListeners(tool);
    }, 0);
}

function addPropertyControlListeners(tool) {
    switch (tool) {
        case 'text-tool':
            if (document.getElementById('font-size-select')) {
                document.getElementById('font-size-select').addEventListener('change', (e) => {
                    // Update font size in currently selected annotation or for next annotation
                    if (currentAnnotation && currentAnnotation.type === 'text') {
                        currentAnnotation.fontSize = parseInt(e.target.value);
                    }
                });
            }
            
            if (document.getElementById('font-family-select')) {
                document.getElementById('font-family-select').addEventListener('change', (e) => {
                    // Update font family in currently selected annotation or for next annotation
                    if (currentAnnotation && currentAnnotation.type === 'text') {
                        currentAnnotation.fontFamily = e.target.value;
                    }
                });
            }
            break;
        case 'highlight-tool':
            if (document.getElementById('opacity-range')) {
                document.getElementById('opacity-range').addEventListener('input', (e) => {
                    const opacity = parseInt(e.target.value) / 100;
                    // Update opacity in currently selected annotation or for next annotation
                    if (currentAnnotation && currentAnnotation.type === 'highlight') {
                        currentAnnotation.opacity = opacity;
                        const highlight = document.querySelector('.temp-annotation');
                        if (highlight) highlight.style.opacity = opacity;
                    }
                });
            }
            break;
        case 'draw-tool':
            if (document.getElementById('line-width-range')) {
                document.getElementById('line-width-range').addEventListener('input', (e) => {
                    const lineWidth = parseInt(e.target.value);
                    // Update line width in currently selected annotation or for next annotation
                    if (currentAnnotation && currentAnnotation.type === 'draw') {
                        currentAnnotation.lineWidth = lineWidth;
                        const path = document.querySelector('.temp-path');
                        if (path) path.setAttribute('stroke-width', lineWidth);
                    }
                });
            }
            break;
        case 'shape-tool':
            if (document.getElementById('shape-type-select')) {
                document.getElementById('shape-type-select').addEventListener('change', (e) => {
                    // Update shape type in currently selected annotation or for next annotation
                    if (currentAnnotation && currentAnnotation.type === 'shape') {
                        currentAnnotation.shape = e.target.value;
                    }
                });
            }
            
            if (document.getElementById('shape-line-width-range')) {
                document.getElementById('shape-line-width-range').addEventListener('input', (e) => {
                    const lineWidth = parseInt(e.target.value);
                    // Update line width in currently selected annotation or for next annotation
                    if (currentAnnotation && currentAnnotation.type === 'shape') {
                        currentAnnotation.lineWidth = lineWidth;
                        const shape = document.querySelector('.temp-shape');
                        if (shape) shape.setAttribute('stroke-width', lineWidth);
                    }
                });
            }
            
            if (document.getElementById('fill-shape-checkbox')) {
                document.getElementById('fill-shape-checkbox').addEventListener('change', (e) => {
                    const fill = e.target.checked;
                    // Update fill in currently selected annotation or for next annotation
                    if (currentAnnotation && currentAnnotation.type === 'shape') {
                        currentAnnotation.fill = fill;
                        const shape = document.querySelector('.temp-shape');
                        if (shape) {
                            if (fill) {
                                shape.setAttribute('fill', selectedColor);
                                shape.setAttribute('fill-opacity', '0.2');
                            } else {
                                shape.setAttribute('fill', 'none');
                            }
                        }
                    }
                });
            }
            break;
    }
}

function updatePropertiesPanel() {
    const colorDisplays = document.querySelectorAll('.color-display');
    colorDisplays.forEach(display => {
        display.style.backgroundColor = selectedColor;
    });
}

// Color Picker Management
function showColorPicker(event) {
    const colorPicker = document.getElementById('color-picker');
    const rect = event.target.getBoundingClientRect();
    
    colorPicker.style.top = (rect.bottom + 5) + 'px';
    colorPicker.style.left = rect.left + 'px';
    colorPicker.classList.add('active');
    
    colorPickerActive = true;
}

function hideColorPicker() {
    const colorPicker = document.getElementById('color-picker');
    colorPicker.classList.remove('active');
    colorPickerActive = false;
}

// Modal Management
function showModal(title, content) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    
    modal.classList.add('active');
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('active');
}

// Export Functions
function printPdf() {
    if (!pdfDoc) return;
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Print PDF</title></head><body>');
    
    // Create an iframe to hold the PDF for printing
    printWindow.document.write('<iframe src="' + URL.createObjectURL(currentPdfFile) + '" width="100%" height="100%" style="border: none;"></iframe>');
    
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    
    // Wait for iframe to load before printing
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
}

function savePdf() {
    if (!pdfDoc) return;
    
    // Currently, we'll just save the original PDF as is
    // In a full implementation, we'd need to use a PDF modification library to save annotations
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(currentPdfFile);
    link.download = 'modified_' + currentPdfFile.name;
    link.click();
    
    showModal('Save PDF', '<p>PDF saved successfully!</p><p class="note">Note: In this demo version, annotations are not saved into the PDF file itself. A full implementation would require server-side processing or a more advanced client-side PDF manipulation library.</p>');
}

// Make functions globally available for event handlers used in HTML attributes
window.showColorPicker = showColorPicker;
