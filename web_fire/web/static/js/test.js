// ==================== 全局状态管理 ====================
const state = {
    currentFile: null,
    currentDir: 'public',
    loggedIn: false,
    username: '',
    isAdmin: false
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

// ==================== 通用认证错误处理====================
function handleAuthError() {
    // 统一处理401/认证过期逻辑
    state.loggedIn = false;
    state.username = '';
    state.isAdmin = false;
    updateUIForLoggedOut();
    alert('登录已过期，请重新登录');
    showLoginModal(); // 自动弹出登录框
}

// ==================== 页面初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 先检查登录状态，再初始化页面（保证初始化时已有登录状态）
    checkAuthStatus().then(() => {
        initDetectPage();  // 初始化检测页面
        initFileStorage(); // 初始化文件存储页面
        initTrainPage();   // 新增：初始化训练页面
    });

    // 任务类型切换（移到初始化内，避免重复绑定）
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

// ==================== 用户认证功能 ====================
function updateUIForLoggedIn(username) {
    // 更新登录按钮区域
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const usernameSpan = document.getElementById('usernameSpan');

    if (loginBtn) loginBtn.style.display = 'none';
    if (userInfo) {
        userInfo.style.display = 'flex';
        document.getElementById('logoutBtn').style.display = 'inline'; // 显示登出按钮
    }
    if (usernameSpan) usernameSpan.textContent = username;

    // 显示所有需要登录的内容
    document.querySelectorAll('.requires-login').forEach(el => {
        el.style.display = '';
    });

    // 隐藏所有登录提示
    document.getElementById('loginPrompt').style.display = 'none';
    document.getElementById('filesLoginPrompt').style.display = 'none';
    document.getElementById('trainLoginPrompt').style.display = 'none';

    // 显示核心内容
    document.getElementById('detectContent').style.display = 'block';
    document.getElementById('filesContent').style.display = 'block';

    // 更新训练页面UI（区分管理员/普通用户）
    updateTrainPageUI();

    // 登录成功后加载核心数据
    refreshModelList();
    refreshDatasets();
    refreshFileList();
    if (state.isAdmin) refreshTaskList();
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

// 修复：删除重复定义的updateTrainPageUI，保留一个完整版本
function updateTrainPageUI() {
    if (!state.loggedIn) {
        document.getElementById('trainLoginPrompt').style.display = 'block';
        document.getElementById('trainAdminPrompt').style.display = 'none';
        document.getElementById('trainContent').style.display = 'none';
        return;
    }
    if (state.isAdmin) {
        document.getElementById('trainAdminPrompt').style.display = 'none';
        document.getElementById('trainLoginPrompt').style.display = 'none';
        document.getElementById('trainContent').style.display = 'block';
        refreshTaskList();
    } else {
        document.getElementById('trainAdminPrompt').style.display = 'block';
        document.getElementById('trainLoginPrompt').style.display = 'none';
        document.getElementById('trainContent').style.display = 'none';
    }
}

function updateUIForLoggedOut() {
    // 重置所有用户状态
    state.loggedIn = false;
    state.username = '';
    state.isAdmin = false;

    // 隐藏用户信息，显示登录按钮
    if (document.getElementById('userInfo')) document.getElementById('userInfo').style.display = 'none';
    if (document.getElementById('logoutBtn')) document.getElementById('logoutBtn').style.display = 'none';
    if (document.getElementById('loginBtn')) document.getElementById('loginBtn').style.display = 'inline';

    // 显示登录提示，隐藏需要登录的内容
    if (document.getElementById('loginPrompt')) document.getElementById('loginPrompt').style.display = 'block';
    if (document.getElementById('detectContent')) document.getElementById('detectContent').style.display = 'none';
    if (document.getElementById('filesLoginPrompt')) document.getElementById('filesLoginPrompt').style.display = 'block';
    if (document.getElementById('filesContent')) document.getElementById('filesContent').style.display = 'none';
    if (document.getElementById('trainLoginPrompt')) document.getElementById('trainLoginPrompt').style.display = 'block';
    if (document.getElementById('trainContent')) document.getElementById('trainContent').style.display = 'none';
}

// 模态框控制（新增：重置表单）
function showLoginModal() {
    const authModal = document.getElementById('authModal');
    if (authModal) authModal.style.display = 'flex';
    showLoginForm();
    // 重置登录/注册表单
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
}
function closeAuthModal() {
    const authModal = document.getElementById('authModal');
    if (authModal) authModal.style.display = 'none';
}
function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}
function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

// 登录（新增：表单验证、错误处理）
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

// 注册（新增：表单验证、密码一致性检查）
function register() {
    const usernameInput = document.getElementById('regUsername');
    const passwordInput = document.getElementById('regPassword');
    const confirmPwdInput = document.getElementById('regConfirmPassword');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const confirm_password = confirmPwdInput.value.trim();

    // 表单验证
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
    if (password.length < 6) {
        alert('密码长度不能少于6位');
        passwordInput.focus();
        return;
    }
    if (password !== confirm_password) {
        alert('两次输入的密码不一致');
        confirmPwdInput.focus();
        return;
    }

    fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, confirm_password })
    })
    .then(res => {
        if (!res.ok) throw new Error('注册请求失败');
        return res.json();
    })
    .then(res => {
        if (res.code === 200) {
            alert(res.message);
            showLoginForm(); // 切换到登录表单
            // 重置注册表单
            document.getElementById('registerForm').reset();
        } else {
            alert(res.message);
        }
    })
    .catch(err => {
        console.error('注册失败:', err);
        alert('注册失败，请检查网络或账号信息');
    });
}

// 登出（新增：完整状态重置）
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
    // 修复：event.target 可能不存在的问题
    const target = event?.target || document.querySelector(`[onclick="switchTab('${tabName}')"]`);
    if (target) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        target.classList.add('active');
    }

    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const tabContent = document.getElementById(`tab-${tabName}`);
    if (tabContent) tabContent.classList.add('active');

    if (tabName === 'future' && state.loggedIn) {
        refreshModelList();
        refreshDatasets();
    }
}

// ==================== 原有功能：火焰检测 ====================
function initDetectPage() {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    if (!fileInput || !dropZone) return; // 容错：元素不存在时不报错

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
    });
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.background = '#e0e7ff';
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.style.background = '#f8f9ff';
    });
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
    if (fileInfo) {
        fileInfo.style.display = 'block';
        fileInfo.innerHTML = `<strong>已选择文件:</strong> ${file.name} (${formatBytes(file.size)})`;
    }
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

    // 容错：元素不存在时不报错
    if (!progressSection || !resultSection) return;

    progressSection.style.display = 'block';
    resultSection.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';
    let startTime = Date.now();

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && progressFill && progressText && speedText) {
            const percent = (e.loaded / e.total) * 100;
            progressFill.style.width = percent + '%';
            progressText.textContent = `上传中: ${percent.toFixed(1)}%`;
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0) speedText.textContent = `速度: ${formatSpeed(e.loaded / elapsed)}`;
        }
    };

    xhr.onload = () => {
        if (progressSection) progressSection.style.display = 'none';
        if (xhr.status === 200) {
            const res = JSON.parse(xhr.responseText);
            if (res.code === 200) {
                const data = res.data;
                if (resultSummary) {
                    resultSummary.innerHTML = `
                        <h4>✅ 检测完成</h4>
                        <p>文件: ${data.original_filename}</p>
                        <p>总目标数: ${data.summary.total} | 烟雾: ${data.summary.smoke_count} | 火焰: ${data.summary.fire_count}</p>
                    `;
                }
                if (resultImg) resultImg.src = data.thumbnail_url;
                if (resultLink) resultLink.href = data.result_image_url;
                if (resultDetails) {
                    let detailsHtml = '<h5>详细信息:</h5>';
                    data.details.forEach((item, idx) => {
                        detailsHtml += `
                            <div class="detail-item">
                                <strong>${idx+1}. ${item.class}</strong> (置信度: ${item.confidence} | 面积: ${item.area}px)
                            </div>
                        `;
                    });
                    resultDetails.innerHTML = detailsHtml;
                }
                resultSection.style.display = 'block';
            } else if (res.code === 401) {
                handleAuthError(); // 统一处理认证过期
            } else {
                alert('错误: ' + res.message);
            }
        } else if (xhr.status === 401) {
            handleAuthError(); // 统一处理认证过期
        } else {
            alert('请求失败');
        }
    };

    // 网络错误处理
    xhr.onerror = () => {
        if (progressSection) progressSection.style.display = 'none';
        alert('检测请求失败，请检查网络连接');
    };

    xhr.open('POST', '/api/detect/image');
    xhr.send(formData);
}

// ==================== 文件存储 ====================
function initFileStorage() {
    const dirBtns = document.querySelectorAll('.dir-btn');
    const publicFileInput = document.getElementById('publicFileInput');
    const fileDropZone = document.getElementById('fileDropZone');

    // 目录切换
    dirBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            dirBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentDir = btn.dataset.dir || 'public';
            refreshFileList();
        });
    });

    // 文件上传
    if (publicFileInput) {
        publicFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) uploadPublicFiles(e.target.files);
        });
    }

    // 拖拽上传
    if (fileDropZone) {
        fileDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileDropZone.style.background = '#e9ecef';
        });
        fileDropZone.addEventListener('dragleave', () => {
            fileDropZone.style.background = '#f8f9fa';
        });
        fileDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            fileDropZone.style.background = '#f8f9fa';
            if (e.dataTransfer.files.length > 0) uploadPublicFiles(e.dataTransfer.files);
        });
    }
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

    if (!progressArea || !progressFill || !progressText) return;

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
                handleAuthError(); // 统一处理认证过期
            } else {
                alert(res.message);
                refreshFileList();
            }
        } else if (xhr.status === 401) {
            handleAuthError(); // 统一处理认证过期
        } else {
            alert('上传失败');
        }
    };

    // 网络错误处理
    xhr.onerror = () => {
        progressArea.style.display = 'none';
        alert('上传请求失败，请检查网络连接');
    };

    xhr.open('POST', '/api/files/upload');
    xhr.send(formData);
}

function refreshFileList() {
    if (!state.loggedIn) return;

    const fileList = document.getElementById('fileList');
    if (!fileList) return;

    fileList.innerHTML = '<p class="empty-tip">加载中...</p>';

    fetch(`/api/files/list?dir=${state.currentDir}`)
        .then(res => {
            if (res.status === 401) throw new Error('auth_expired');
            if (!res.ok) throw new Error('request_failed');
            return res.json();
        })
        .then(res => {
            if (res.code === 200) {
                const files = res.data.files;
                if (files.length === 0) {
                    fileList.innerHTML = '<p class="empty-tip">暂无文件，上传文件开始使用</p>';
                    return;
                }

                let html = '';
                files.forEach(file => {
                    let thumbnailHtml = '';
                    if (file.is_image) {
                        thumbnailHtml = `<img src="${file.download_url}" class="file-thumb" onclick="previewImage('${file.dir}', '${file.filename}')" alt="缩略图">`;
                    }

                    let actionsHtml = '';
                    if (file.is_image) {
                        actionsHtml += `<button class="btn-preview" onclick="previewImage('${file.dir}', '${file.filename}')">大图</button>`;
                    }
                    actionsHtml += `<a href="${file.download_url}?download=1" target="_blank" class="btn">下载</a>`; // 修复：按钮标签错误
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
        .catch(err => {
            if (err.message === 'auth_expired') {
                handleAuthError();
            } else {
                fileList.innerHTML = '<p class="empty-tip">加载失败</p>';
                console.error('刷新文件列表失败:', err);
            }
        });
}

// 图片预览功能
function previewImage(dir, filename) {
    if (!state.loggedIn) {
        alert('请先登录');
        showLoginModal();
        return;
    }
    window.open(`/preview/${dir}/${filename}`, '_blank');
}

function deleteFile(filename) {
    if (!state.loggedIn) {
        alert('请先登录');
        showLoginModal();
        return;
    }
    if (!confirm(`确定要删除文件 ${filename} 吗？删除后无法恢复！`)) return;

    fetch('/api/files/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: filename, dir: state.currentDir })
    })
    .then(res => {
        if (res.status === 401) throw new Error('auth_expired');
        return res.json();
    })
    .then(res => {
        alert(res.message);
        refreshFileList();
    })
    .catch(err => {
        if (err.message === 'auth_expired') {
            handleAuthError();
        } else {
            alert('删除失败');
            console.error('删除文件失败:', err);
        }
    });
}

// ==================== 训练/验证功能 ====================
function initTrainPage() {
    // 初始化训练页面（保证登录状态加载后执行）
    updateTrainPageUI();
}

// 提交任务
function submitTask(taskType) {
    if (!state.loggedIn) {
        alert('请先登录');
        showLoginModal();
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

        if (!params.model_path) {
            alert('请选择或输入模型配置文件（YAML）或预训练模型路径！');
            return;
        }
        if (!params.data_yaml) {
            alert('请选择数据集！');
            return;
        }
        const ext = params.model_path.split('.').pop().toLowerCase();
        if (!['pt', 'pth', 'yaml', 'yml'].includes(ext)) {
            alert('模型路径必须是 .pt/.pth 预训练模型或 .yaml/.yml 配置文件！');
            return;
        }
    } else {
        params.model_path = document.getElementById('valModelPath').value;
        params.data_yaml = document.getElementById('valDataYaml').value;
        params.val_label_path = document.getElementById('valLabelPath').value;
        params.conf_min = parseFloat(document.getElementById('valConfMin').value);
        params.conf_max = parseFloat(document.getElementById('valConfMax').value);
        params.iou_threshold = parseFloat(document.getElementById('valIouThreshold').value);
        params.imgsz = parseInt(document.getElementById('valImgsz').value);

        if (!params.model_path) {
            alert('请选择或输入模型路径！');
            return;
        }
        if (!params.data_yaml) {
            alert('请选择数据集！');
            return;
        }
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
    .then(res => {
        if (res.status === 401) throw new Error('auth_expired');
        return res.json();
    })
    .then(res => {
        if (res.code === 200) {
            alert(`任务已提交！任务ID: ${res.data.task_id}`);
            refreshTaskList();
        } else {
            alert(res.message);
        }
    })
    .catch(err => {
        if (err.message === 'auth_expired') {
            handleAuthError();
        } else {
            alert('提交任务失败');
            console.error('提交任务失败:', err);
        }
    });
}

// 刷新任务列表
function refreshTaskList() {
    if (!state.isAdmin) return;

    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    taskList.innerHTML = '<p class="empty-tip">加载中...</p>';

    fetch('/api/tasks/list')
        .then(res => {
            if (res.status === 401) throw new Error('auth_expired');
            if (!res.ok) throw new Error('request_failed');
            return res.json();
        })
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
        })
        .catch(err => {
            if (err.message === 'auth_expired') {
                handleAuthError();
            } else {
                taskList.innerHTML = '<p class="empty-tip">加载失败</p>';
                console.error('刷新任务列表失败:', err);
            }
        });
}

// 显示任务日志
function showTaskLogs(taskId) {
    if (!state.isAdmin) return;

    const logSection = document.getElementById('logSection');
    const logContent = document.getElementById('taskLogContent');
    if (!logSection || !logContent) return;

    logSection.style.display = 'block';
    logContent.innerHTML = '加载中...';

    fetch(`/api/tasks/${taskId}/logs`)
        .then(res => {
            if (res.status === 401) throw new Error('auth_expired');
            if (!res.ok) throw new Error('request_failed');
            return res.json();
        })
        .then(res => {
            if (res.code === 200) {
                logContent.innerHTML = res.data.logs.join('\n');
                logContent.scrollTop = logContent.scrollHeight;
            } else {
                logContent.innerHTML = '加载失败: ' + res.message;
            }
        })
        .catch(err => {
            if (err.message === 'auth_expired') {
                handleAuthError();
            } else {
                logContent.innerHTML = '加载失败: 网络请求错误';
                console.error('加载任务日志失败:', err);
            }
        });
}

// 关闭日志区域
function closeLogSection() {
    const logSection = document.getElementById('logSection');
    if (logSection) logSection.style.display = 'none';
}

// 定时刷新任务列表（每5秒）
setInterval(() => {
    if (state.isAdmin && document.getElementById('tab-future')?.classList.contains('active')) {
        refreshTaskList();
    }
}, 5000);

// ==================== 模型文件检索 ====================
function refreshModelList() {
    if (!state.loggedIn) {
        alert('请先登录');
        showLoginModal();
        return;
    }

    const selects = ['trainModelSelect', 'trainYamlSelect', 'valModelSelect', 'valYamlSelect'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) select.innerHTML = '<option value="">加载中...</option>';
    });

    fetch('/api/models/list')
        .then(res => {
            if (res.status === 401) throw new Error('auth_expired');
            if (!res.ok) throw new Error('request_failed');
            return res.json();
        })
        .then(res => {
            if (res.code === 200) {
                const models = res.data.models;
                const yamls = res.data.yamls;

                const modelOptions = '<option value="">-- 选择模型文件 --</option>' +
                    models.map(m => `<option value="${m.path}">${m.display_path} (${formatBytes(m.size)})</option>`).join('');

                const trainModelSelect = document.getElementById('trainModelSelect');
                const valModelSelect = document.getElementById('valModelSelect');
                if (trainModelSelect) trainModelSelect.innerHTML = modelOptions;
                if (valModelSelect) valModelSelect.innerHTML = modelOptions;

                const yamlOptions = '<option value="">-- 选择数据集配置 --</option>' +
                    yamls.map(y => `<option value="${y.path}">${y.display_path} (${formatBytes(y.size)})</option>`).join('');

                const trainYamlSelect = document.getElementById('trainYamlSelect');
                const valYamlSelect = document.getElementById('valYamlSelect');
                if (trainYamlSelect) trainYamlSelect.innerHTML = yamlOptions;
                if (valYamlSelect) valYamlSelect.innerHTML = yamlOptions;
            } else {
                alert(res.message);
            }
        })
        .catch(err => {
            if (err.message === 'auth_expired') {
                handleAuthError();
            } else {
                console.error(err);
                alert('加载模型列表失败');
            }
        });
}

// ==================== 数据集管理 ====================
function refreshDatasets() {
    if (!state.loggedIn) return;

    fetch('/api/datasets/list')
        .then(res => {
            if (res.status === 401) throw new Error('auth_expired');
            if (!res.ok) throw new Error('request_failed');
            return res.json();
        })
        .then(res => {
            if (res.code === 200) {
                const datasets = res.data.datasets;

                const trainSelect = document.getElementById('trainDatasetSelect');
                const valSelect = document.getElementById('valDatasetSelect');
                if (!trainSelect || !valSelect) return;

                let optionsHtml = '<option value="">-- 选择数据集 --</option>';
                let defaultPath = '';

                datasets.forEach(ds => {
                    const defaultTag = ds.is_default ? ' (默认)' : '';
                    optionsHtml += `<option value="${ds.path}">${ds.name}${defaultTag}</option>`;
                    if (ds.is_default) defaultPath = ds.path;
                });

                trainSelect.innerHTML = optionsHtml;
                valSelect.innerHTML = optionsHtml;

                if (defaultPath) {
                    const trainDataYaml = document.getElementById('trainDataYaml');
                    const valDataYaml = document.getElementById('valDataYaml');
                    if (trainDataYaml) trainDataYaml.value = defaultPath;
                    if (valDataYaml) valDataYaml.value = defaultPath;
                    trainSelect.value = defaultPath;
                    valSelect.value = defaultPath;
                }

                updateDatasetList(datasets);
            }
        })
        .catch(err => {
            if (err.message === 'auth_expired') {
                handleAuthError();
            } else {
                console.error('刷新数据集失败:', err);
            }
        });
}

function updateDatasetList(datasets) {
    const listDiv = document.getElementById('datasetList');
    if (!listDiv) return;

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
    const datasetModal = document.getElementById('datasetModal');
    if (datasetModal) {
        datasetModal.style.display = 'flex';
        refreshDatasets();
    }
}

function closeDatasetModal() {
    const datasetModal = document.getElementById('datasetModal');
    if (datasetModal) datasetModal.style.display = 'none';
}

function addDataset() {
    if (!state.loggedIn) {
        alert('请先登录');
        showLoginModal();
        return;
    }

    const nameInput = document.getElementById('newDatasetName');
    const pathInput = document.getElementById('newDatasetPath');
    const setDefaultCheckbox = document.getElementById('newDatasetDefault');

    const name = nameInput.value.trim();
    const path = pathInput.value.trim();
    const setDefault = setDefaultCheckbox.checked;

    if (!name || !path) {
        alert('请填写数据集名称和路径');
        return;
    }

    fetch('/api/datasets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path, set_default: setDefault })
    })
    .then(res => {
        if (res.status === 401) throw new Error('auth_expired');
        return res.json();
    })
    .then(res => {
        if (res.code === 200) {
            alert('数据集添加成功！');
            nameInput.value = '';
            pathInput.value = '';
            setDefaultCheckbox.checked = false;
            refreshDatasets();
        } else {
            alert(res.message);
        }
    })
    .catch(err => {
        if (err.message === 'auth_expired') {
            handleAuthError();
        } else {
            alert('添加数据集失败');
            console.error('添加数据集失败:', err);
        }
    });
}

function deleteDataset(datasetId) {
    if (!state.loggedIn) {
        alert('请先登录');
        showLoginModal();
        return;
    }
    if (!confirm('确定要删除这个数据集吗？')) return;

    fetch('/api/datasets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: datasetId })
    })
    .then(res => {
        if (res.status === 401) throw new Error('auth_expired');
        return res.json();
    })
    .then(res => {
        if (res.code === 200) {
            alert('数据集删除成功！');
            refreshDatasets();
        } else {
            alert(res.message);
        }
    })
    .catch(err => {
        if (err.message === 'auth_expired') {
            handleAuthError();
        } else {
            alert('删除数据集失败');
            console.error('删除数据集失败:', err);
        }
    });
}

function setDefaultDataset(datasetId) {
    if (!state.loggedIn) {
        alert('请先登录');
        showLoginModal();
        return;
    }

    fetch('/api/datasets/set-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: datasetId })
    })
    .then(res => {
        if (res.status === 401) throw new Error('auth_expired');
        return res.json();
    })
    .then(res => {
        if (res.code === 200) {
            alert('默认数据集设置成功！');
            refreshDatasets();
        } else {
            alert(res.message);
        }
    })
    .catch(err => {
        if (err.message === 'auth_expired') {
            handleAuthError();
        } else {
            alert('设置默认数据集失败');
            console.error('设置默认数据集失败:', err);
        }
    });
}