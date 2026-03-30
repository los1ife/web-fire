// ==================== 全局状态管理 ====================
const state = {
    currentFile: null,
    currentDir: 'public',
    loggedIn: false
};

// ==================== 工具函数 ====================
function formatBytes(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}
function formatSpeed(bps) {
    if (bps >= 1048576) return (bps / 1048576).toFixed(2) + ' MB/s';
    if (bps >= 1024) return (bps / 1024).toFixed(2) + ' KB/s';
    return bps + ' B/s';
}
function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN');
}

// ==================== 页面初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus(); // 检查登录状态
    initDetectPage();  // 初始化检测页面
    initFileStorage(); // 初始化文件存储页面
    updateTrainPageUI() // 初始化训练页面
});

// ==================== 用户认证功能 ====================

function updateUIForLoggedIn(username) {
    // ===== 1. 获取所有关键元素（包含登出按钮）=====
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const usernameSpan = document.getElementById('usernameDisplay');
    const logoutBtn = document.getElementById('logoutBtn'); //

    // ===== 2. 登录按钮：隐藏 =====
    if (loginBtn) {
        loginBtn.style.display = 'none';
    }

    // ===== 3. 用户信息区域：显示并调整布局 =====
    if (userInfo) {
        userInfo.style.display = 'flex';
        userInfo.style.alignItems = 'center'; // 新增：确保用户名和登出按钮水平居中对齐
        userInfo.style.gap = '10px'; // 新增：用户名和登出按钮之间留间距
    }

    // ===== 4. 用户名显示 =====
    if (usernameSpan) {
        usernameSpan.textContent = username;
    }

    // ===== 5. 登出按钮：显示 =====
    if (logoutBtn) {
        logoutBtn.style.display = 'inline-block'; // 显式设置为行内块，适配布局
    }

    // ===== 6. 明确显示需要登录的内容=====
    document.querySelectorAll('.requires-login').forEach(el => {
        // 根据元素类型适配display值，避免布局错乱
        if (el.tagName === 'DIV' || el.tagName === 'SECTION' || el.tagName === 'FORM') {
            el.style.display = 'block';
        } else if (el.tagName === 'BUTTON' || el.tagName === 'SPAN' || el.tagName === 'INPUT') {
            el.style.display = 'inline-block';
        } else {
            el.style.display = ''; // 其他元素用默认值
        }
    });
}


function checkAuthStatus() {
    // 返回Promise，保证初始化顺序
    return fetch('/api/auth/status')
        .then(res => {
            if (!res.ok) throw new Error('网络请求失败');
            return res.json();
        })
        .then(res => {
            if (res.code === 200 && res.data.logged_in) {
                state.loggedIn = true;
                state.username = res.data.username;
                state.isAdmin = res.data.role === 'admin';
                updateUIForLoggedIn(state.username);
            } else {
                state.loggedIn = false;
                state.username = '';
                state.isAdmin = false;
                updateUIForLoggedOut();
            }
        })
        .catch(err => {
            console.error('检查登录状态失败:', err);
            state.loggedIn = false;
            state.username = '';
            state.isAdmin = false;
            updateUIForLoggedOut();
        });
}


function updateTrainPageUI() {
    if (state.loggedIn) {
        document.getElementById('trainLoginPrompt').style.display = 'none';
        document.getElementById('trainContent').style.display = 'block';
        refreshTaskList();
    } else {
        document.getElementById('trainLoginPrompt').style.display = 'block';
        document.getElementById('trainContent').style.display = 'none';
    }
}

function updateUIForLoggedOut() {
    // 获取所有关键元素
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const usernameSpan = document.getElementById('usernameDisplay');
    const logoutBtn = document.getElementById('logoutBtn');

    // 登录按钮：显示
    if (loginBtn) {
        loginBtn.style.display = 'inline-block';
    }

    // 用户信息区域：隐藏
    if (userInfo) {
        userInfo.style.display = 'none';
    }

    // 清空用户名（可选，防止残留）
    if (usernameSpan) {
        usernameSpan.textContent = '';
    }

    // 登出按钮：隐藏
    if (logoutBtn) {
        logoutBtn.style.display = 'none';
    }

    // 隐藏所有需要登录的内容
    document.querySelectorAll('.requires-login').forEach(el => {
        el.style.display = 'none';
    });
}

// 模态框控制
function showLoginModal() {
    document.getElementById('authModal').style.display = 'flex';
    showLoginForm();
}
function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}
function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}
function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

// 登录
function login() {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // 表单空值验证
    if (!username) {
        alert('请输入用户名');
        usernameInput.focus();
        return;
    }
    if (!password) {
        alert('请输入密码');
        passwordInput.focus();
        return;
    }

    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(res => {
        if (!res.ok) throw new Error('登录请求失败');
        return res.json();
    })
    .then(res => {
        if (res.code === 200) {
            alert(res.message);
            closeAuthModal();
            // 更新全局状态
            state.loggedIn = true;
            state.username = res.data.username;
            state.isAdmin = res.data.role === 'admin';
            updateUIForLoggedIn(state.username);
        } else {
            alert(res.message);
        }
    })
    .catch(err => {
        console.error('登录失败:', err);
        alert('登录失败，请检查网络或账号信息');
    });
}

// 注册
function register() {
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const confirm_password = document.getElementById('regConfirmPassword').value;

    fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, confirm_password })
    })
    .then(res => res.json())
    .then(res => {
        if (res.code === 200) {
            alert(res.message);
            showLoginForm();
        } else {
            alert(res.message);
        }
    });
}

// 登出
function logout() {
    if (!confirm('确定要退出登录吗？')) return;
    fetch('/api/auth/logout', { method: 'POST' })
        .then(res => res.json())
        .then(res => {
            alert(res.message);
            updateUIForLoggedOut();
        })
        .catch(err => {
            console.error('登出失败:', err);
            // 强制重置UI（即使接口失败）
            updateUIForLoggedOut();
            alert('登出请求失败，但已强制退出登录状态');
        });
}

// ==================== 标签页切换 ====================
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'future' && state.loggedIn) {
        refreshModelList();
        refreshDatasets();  // 刷新数据集
    }
}

// ==================== 原有功能：火焰检测 ====================
function initDetectPage() {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
    });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.background = '#e0e7ff'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.background = '#f8f9ff'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.background = '#f8f9ff';
        if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
    });
}



function handleFileSelect(file) {
    if (!state.loggedIn) {
        alert('请先登录');
        showLoginModal(); // 自动弹出登录框
        return;
    }
    state.currentFile = file;
    const fileInfo = document.getElementById('fileInfo');
    fileInfo.style.display = 'block';
    fileInfo.innerHTML = `<strong>已选择文件:</strong> ${file.name} (${formatBytes(file.size)})`;
    startDetection();
}

function startDetection() {
    if (!state.currentFile || !state.loggedIn) return;

    const formData = new FormData();
    formData.append('file', state.currentFile);

    const xhr = new XMLHttpRequest();
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const speedText = document.getElementById('speedText');
    const resultSection = document.getElementById('resultSection');
    const resultSummary = document.getElementById('resultSummary');
    const resultImg = document.getElementById('resultImg');
    const resultLink = document.getElementById('resultLink');
    const resultDetails = document.getElementById('resultDetails');

    progressSection.style.display = 'block';
    resultSection.style.display = 'none';
    progressFill.style.width = '0%';
    let startTime = Date.now();

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            progressFill.style.width = percent + '%';
            progressText.textContent = `上传中: ${percent.toFixed(1)}%`;
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0) speedText.textContent = `速度: ${formatSpeed(e.loaded / elapsed)}`;
        }
    };

    xhr.onload = () => {
        progressSection.style.display = 'none';
        if (xhr.status === 200) {
            const res = JSON.parse(xhr.responseText);
            if (res.code === 200) {
                const data = res.data;
                resultSummary.innerHTML = `
                    <h4>✅ 检测完成</h4>
                    <p>文件: ${data.original_filename}</p>
                    <p>总目标数: ${data.summary.total} | 烟雾: ${data.summary.smoke_count} | 火焰: ${data.summary.fire_count}</p>
                `;
                resultImg.src = data.thumbnail_url;
                resultLink.href = data.result_image_url;
                let detailsHtml = '<h5>详细信息:</h5>';
                data.details.forEach((item, idx) => {
                    detailsHtml += `
                        <div class="detail-item">
                            <strong>${idx+1}. ${item.class}</strong> (置信度: ${item.confidence} | 面积: ${item.area}px)
                        </div>
                    `;
                });
                resultDetails.innerHTML = detailsHtml;
                resultSection.style.display = 'block';
            } else if (res.code === 401) {
                alert('登录已过期，请重新登录');
                updateUIForLoggedOut();
            } else {
                alert('错误: ' + res.message);
            }
        } else {
            alert('请求失败');
        }
    };

    xhr.open('POST', '/api/detect/image');
    xhr.send(formData);
}

// ==================== 文件存储 ====================
function initFileStorage() {
    document.querySelectorAll('.dir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentDir = btn.dataset.dir;
            refreshFileList();
        });
    });

    const publicFileInput = document.getElementById('publicFileInput');
    publicFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) uploadPublicFiles(e.target.files);
    });

    const fileDropZone = document.getElementById('fileDropZone');
    fileDropZone.addEventListener('dragover', (e) => { e.preventDefault(); fileDropZone.style.background = '#e9ecef'; });
    fileDropZone.addEventListener('dragleave', () => { fileDropZone.style.background = '#f8f9fa'; });
    fileDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDropZone.style.background = '#f8f9fa';
        if (e.dataTransfer.files.length > 0) uploadPublicFiles(e.dataTransfer.files);
    });
}

function uploadPublicFiles(files) {
    if (!state.loggedIn) {
        alert('请先登录');
        showLoginModal(); // 自动弹出登录框
        return;
    }

    const formData = new FormData();
    for (let file of files) formData.append('files', file);

    const progressArea = document.getElementById('uploadProgressArea');
    const progressFill = document.getElementById('publicProgressFill');
    const progressText = document.getElementById('uploadProgressText');

    progressArea.style.display = 'block';
    progressFill.style.width = '0%';
    let startTime = Date.now();

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            progressFill.style.width = percent + '%';
            progressText.textContent = `正在上传: ${percent.toFixed(1)}% | ${formatSpeed(e.loaded / ((Date.now() - startTime)/1000))}`;
        }
    };

    xhr.onload = () => {
        progressArea.style.display = 'none';
        if (xhr.status === 200) {
            const res = JSON.parse(xhr.responseText);
            if (res.code === 401) {
                alert('登录已过期');
                updateUIForLoggedOut();
            } else {
                alert(res.message);
                refreshFileList();
            }
        } else {
            alert('上传失败');
        }
    };

    xhr.open('POST', '/api/files/upload');
    xhr.send(formData);
}

function refreshFileList() {
    if (!state.loggedIn) return;

    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '<p class="empty-tip">加载中...</p>';

    fetch(`/api/files/list?dir=${state.currentDir}`)
        .then(res => res.json())
        .then(res => {
            if (res.code === 401) {
                updateUIForLoggedOut();
                return;
            }
            if (res.code === 200) {
                const files = res.data.files;
                if (files.length === 0) {
                    fileList.innerHTML = '<p class="empty-tip">暂无文件，上传文件开始使用</p>';
                    return;
                }

                let html = '';
                files.forEach(file => {
                    // 如果是图片，显示小缩略图
                    let thumbnailHtml = '';
                    if (file.is_image) {
                        // 直接使用 storage 路径作为缩略图，不保证清晰度，只保证可查
                        thumbnailHtml = `<img src="${file.download_url}" class="file-thumb" onclick="previewImage('${file.dir}', '${file.filename}')" alt="缩略图">`;
                    }

                    let actionsHtml = '';
                    if (file.is_image) {
                        actionsHtml += `<button class="btn-preview" onclick="previewImage('${file.dir}', '${file.filename}')">大图</button>`;
                    }
                    actionsHtml += `<a href="${file.download_url}?download=1" target="_blank">下载</button>`;
                    actionsHtml += `<button class="btn-danger" onclick="deleteFile('${file.filename}')">删除</button>`;

                    html += `
                        <div class="file-item">
                            <div class="file-info-with-thumb">
                                ${thumbnailHtml}
                                <div class="file-name-text">
                                    <span>${file.filename}</span>
                                    <small style="color:#999;">${formatBytes(file.size)} | ${formatTimestamp(file.upload_time)}</small>
                                </div>
                            </div>
                            <div class="file-actions">${actionsHtml}</div>
                        </div>
                    `;
                });
                fileList.innerHTML = html;
            }
        })
        .catch(() => {
            fileList.innerHTML = '<p class="empty-tip">加载失败</p>';
        });
}

// 图片预览功能
function previewImage(dir, filename) {
    if (!state.loggedIn) {
        alert('请先登录');
        showLoginModal(); // 自动弹出登录框
        return;
    }
    window.open(`/preview/${dir}/${filename}`, '_blank');
}

function deleteFile(filename) {

    if (!confirm(`确定要删除文件 ${filename} 吗？删除后无法恢复！`)) return;

    fetch('/api/files/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: filename, dir: state.currentDir })
    })
    .then(res => res.json())
    .then(res => {
        alert(res.message);
        refreshFileList();
    })
    .catch(() => {
        alert('删除失败');
    });
}


// ==================== 训练/验证功能 ====================

function updateTrainPageUI() {
    if (state.isAdmin) {
        document.getElementById('trainAdminPrompt').style.display = 'none';
        document.getElementById('trainContent').style.display = 'block';
        refreshTaskList();
    } else {
        document.getElementById('trainAdminPrompt').style.display = 'block';
        document.getElementById('trainContent').style.display = 'none';
    }
}

// 任务类型切换
document.addEventListener('DOMContentLoaded', () => {
    // ... (原有初始化代码保持不变)

    // 新增：任务类型切换
    document.querySelectorAll('.task-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.task-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const type = btn.dataset.type;
            if (type === 'train') {
                document.getElementById('trainForm').style.display = 'block';
                document.getElementById('valForm').style.display = 'none';
            } else {
                document.getElementById('trainForm').style.display = 'none';
                document.getElementById('valForm').style.display = 'block';
            }
        });
    });
});

// 提交任务
function submitTask(taskType) {
    if (!state.loggedIn) {
        alert('请先登录');
        return;
    }

    let params = { task_type: taskType };

    if (taskType === 'train') {
        params.model_path = document.getElementById('trainModelPath').value;
        params.data_yaml = document.getElementById('trainDataYaml').value;
        params.epochs = parseInt(document.getElementById('trainEpochs').value);
        params.batch = parseInt(document.getElementById('trainBatch').value);
        params.imgsz = parseInt(document.getElementById('trainImgsz').value);
        params.project = document.getElementById('trainProject').value;
        params.name = document.getElementById('trainName').value || `exp_${Date.now()}`;

        // 【修复】添加必填检查
        if (!params.model_path) {
            alert('请选择或输入模型配置文件（YAML）或预训练模型路径！');
            return;
        }
        if (!params.data_yaml) {
            alert('请选择数据集！');
            return;
        }
        // 检查模型路径格式
        const ext = params.model_path.split('.').pop().toLowerCase();
        if (!['pt', 'pth', 'yaml', 'yml'].includes(ext)) {
            alert('模型路径必须是 .pt/.pth 预训练模型或 .yaml/.yml 配置文件！');
            return;
        }
    } else {
        // 验证任务参数
        params.model_path = document.getElementById('valModelPath').value;
        params.data_yaml = document.getElementById('valDataYaml').value;
        params.val_label_path = document.getElementById('valLabelPath').value;
        params.conf_min = parseFloat(document.getElementById('valConfMin').value);
        params.conf_max = parseFloat(document.getElementById('valConfMax').value);
        params.iou_threshold = parseFloat(document.getElementById('valIouThreshold').value);
        // params.imgsz = parseInt(document.getElementById('valImgsz').value);

        // 添加必填检查
        if (!params.model_path) {
            alert('请选择或输入模型路径！');
            return;
        }
        if (!params.data_yaml) {
            alert('请选择数据集！');
            return;
        }
        // 检查模型路径格式（验证需要 .pt/.pth）
        const ext = params.model_path.split('.').pop().toLowerCase();
        if (!['pt', 'pth'].includes(ext)) {
            alert('验证任务需要 .pt 或 .pth 格式的预训练模型！');
            return;
        }
    }

    fetch('/api/tasks/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    })
    .then(res => res.json())
    .then(res => {
        if (res.code === 200) {
            alert(`任务已提交！任务ID: ${res.data.task_id}`);
            refreshTaskList();
        } else {
            alert(res.message);
        }
    });
}

// 刷新任务列表
function refreshTaskList() {
    if (!state.isAdmin) return;

    const taskList = document.getElementById('taskList');
    taskList.innerHTML = '<p class="empty-tip">加载中...</p>';

    fetch('/api/tasks/list')
        .then(res => res.json())
        .then(res => {
            if (res.code === 200) {
                const tasks = res.data.tasks;
                if (tasks.length === 0) {
                    taskList.innerHTML = '<p class="empty-tip">暂无任务</p>';
                    return;
                }

                let html = '';
                tasks.forEach(task => {
                    const statusClass = `status-${task.status}`;
                    const statusText = {
                        'pending': '等待中',
                        'running': '运行中',
                        'completed': '已完成',
                        'failed': '失败'
                    }[task.status] || task.status;

                    const typeText = task.type === 'train' ? '训练' : '验证';
                    const time = new Date(task.created_at * 1000).toLocaleString('zh-CN');

                    html += `
                        <div class="task-item" onclick="showTaskLogs('${task.id}')">
                            <div class="task-header">
                                <span class="task-id">${task.id}</span>
                                <span class="task-status ${statusClass}">${statusText}</span>
                            </div>
                            <div class="task-meta">
                                类型: ${typeText} | 创建时间: ${time}
                            </div>
                        </div>
                    `;
                });
                taskList.innerHTML = html;
            }
        });
}

// 显示任务日志
function showTaskLogs(taskId) {
    if (!state.isAdmin) return;

    document.getElementById('logSection').style.display = 'block';
    const logContent = document.getElementById('taskLogContent');
    logContent.innerHTML = '加载中...';

    fetch(`/api/tasks/${taskId}/logs`)
        .then(res => res.json())
        .then(res => {
            if (res.code === 200) {
                logContent.innerHTML = res.data.logs.join('\n');
                logContent.scrollTop = logContent.scrollHeight; // 滚动到底部
            } else {
                logContent.innerHTML = '加载失败: ' + res.message;
            }
        });
}

// 关闭日志区域
function closeLogSection() {
    document.getElementById('logSection').style.display = 'none';
}

// 定时刷新任务列表（每5秒）
setInterval(() => {
    if (state.isAdmin && document.getElementById('tab-future').classList.contains('active')) {
        refreshTaskList();
    }
}, 5000);

// ==================== 模型文件检索 ====================

function refreshModelList() {
    if (!state.loggedIn) {
        alert('请先登录');
        return;
    }

    // 显示加载中
    const selects = ['trainModelSelect', 'trainYamlSelect', 'valModelSelect', 'valYamlSelect'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '<option value="">加载中...</option>';
        }
    });

    fetch('/api/models/list')
        .then(res => res.json())
        .then(res => {
            if (res.code === 200) {
                const models = res.data.models;
                const yamls = res.data.yamls;

                // 填充模型下拉框
                const modelOptions = '<option value="">-- 选择模型文件 --</option>' +
                    models.map(m => `<option value="${m.path}">${m.display_path} (${formatBytes(m.size)})</option>`).join('');

                document.getElementById('trainModelSelect').innerHTML = modelOptions;
                document.getElementById('valModelSelect').innerHTML = modelOptions;

                // 填充YAML下拉框
                const yamlOptions = '<option value="">-- 选择数据集配置 --</option>' +
                    yamls.map(y => `<option value="${y.path}">${y.display_path} (${formatBytes(y.size)})</option>`).join('');

                document.getElementById('trainYamlSelect').innerHTML = yamlOptions;
                document.getElementById('valYamlSelect').innerHTML = yamlOptions;
            } else {
                alert(res.message);
            }
        })
}

// ==================== 数据集管理 ====================

function refreshDatasets() {
    if (!state.loggedIn) {
        alert('请先登录');
        return;
    }

    fetch('/api/datasets/list')
        .then(res => res.json())
        .then(res => {
            if (res.code === 200) {
                const datasets = res.data.datasets;

                // 更新训练和验证的下拉框
                const trainSelect = document.getElementById('trainDatasetSelect');
                const valSelect = document.getElementById('valDatasetSelect');

                let optionsHtml = '<option value="">-- 选择数据集 --</option>';
                let defaultPath = '';

                datasets.forEach(ds => {
                    const defaultTag = ds.is_default ? ' (默认)' : '';
                    optionsHtml += `<option value="${ds.path}">${ds.name}${defaultTag}</option>`;
                    if (ds.is_default) {
                        defaultPath = ds.path;
                    }
                });

                trainSelect.innerHTML = optionsHtml;
                valSelect.innerHTML = optionsHtml;

                // 设置默认值
                if (defaultPath) {
                    document.getElementById('trainDataYaml').value = defaultPath;
                    document.getElementById('valDataYaml').value = defaultPath;
                    // 选中默认选项
                    trainSelect.value = defaultPath;
                    valSelect.value = defaultPath;
                }

                // 更新数据集管理列表
                updateDatasetList(datasets);
            }
        });
}

function updateDatasetList(datasets) {
    const listDiv = document.getElementById('datasetList');
    if (datasets.length === 0) {
        listDiv.innerHTML = '<p class="empty-tip">暂无数据集</p>';
        return;
    }

    let html = '';
    datasets.forEach(ds => {
        html += `
            <div class="dataset-item">
                <div class="dataset-info">
                    <div>
                        <span class="dataset-name">${ds.name}</span>
                        ${ds.is_default ? '<span class="dataset-default">默认</span>' : ''}
                    </div>
                    <div class="dataset-path">${ds.path}</div>
                </div>
                <div class="dataset-actions">
                    ${!ds.is_default ? `<button class="btn-secondary" onclick="setDefaultDataset('${ds.id}')">设为默认</button>` : ''}
                    <button class="btn-danger" onclick="deleteDataset('${ds.id}')">删除</button>
                </div>
            </div>
        `;
    });
    listDiv.innerHTML = html;
}

function openDatasetModal() {
    document.getElementById('datasetModal').style.display = 'flex';
    refreshDatasets();
}

function closeDatasetModal() {
    document.getElementById('datasetModal').style.display = 'none';
}

function addDataset() {
    const name = document.getElementById('newDatasetName').value.trim();
    const path = document.getElementById('newDatasetPath').value.trim();
    const setDefault = document.getElementById('newDatasetDefault').checked;

    if (!name || !path) {
        alert('请填写数据集名称和路径');
        return;
    }

    fetch('/api/datasets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path, set_default: setDefault })
    })
    .then(res => res.json())
    .then(res => {
        if (res.code === 200) {
            alert('数据集添加成功！');
            document.getElementById('newDatasetName').value = '';
            document.getElementById('newDatasetPath').value = '';
            document.getElementById('newDatasetDefault').checked = false;
            refreshDatasets();
        } else {
            alert(res.message);
        }
    });
}

function deleteDataset(datasetId) {
    if (!confirm('确定要删除这个数据集吗？')) return;

    fetch('/api/datasets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: datasetId })
    })
    .then(res => res.json())
    .then(res => {
        if (res.code === 200) {
            alert('数据集删除成功！');
            refreshDatasets();
        } else {
            alert(res.message);
        }
    });
}

function setDefaultDataset(datasetId) {
    fetch('/api/datasets/set-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: datasetId })
    })
    .then(res => res.json())
    .then(res => {
        if (res.code === 200) {
            alert('默认数据集设置成功！');
            refreshDatasets();
        } else {
            alert(res.message);
        }
    });
}

