const { execSync, spawn } = require('child_process');
const path = require('path');
const http = require('http');

const rootDir = process.cwd();
const frontendDir = path.join(rootDir, 'react-frontend');
const serverPort = 3000;

function runCommand(command, options = {}) {
  try {
    console.log(`Executing: ${command}`);
    if (process.platform === 'win32' && command.startsWith('npm')) {
      execSync(`cmd.exe /c "${command}"`, { stdio: 'inherit', ...options });
    } else {
      execSync(command, { stdio: 'inherit', ...options });
    }
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

function checkAndInstall(dir, installCommand, successMessage, errorMessage) {
  const nodeModulesPath = path.join(dir, 'node_modules');
  if (!require('fs').existsSync(nodeModulesPath)) {
    console.log(`Installing dependencies in ${dir}...`);

    if (process.platform === 'win32') {
      execSync(`cmd.exe /c "npm ${installCommand}"`, { stdio: 'inherit', cwd: dir });
    } else {
      execSync(`npm ${installCommand}`, { stdio: 'inherit', cwd: dir });
    }
    console.log(successMessage);
  } else {
    console.log(`Dependencies found in ${dir}. Skipping install.`);
  }
}

function pollServer(callback, retries = 20, delay = 1000) {
  if (retries === 0) {
    console.error('Server did not start in time. Exiting.');
    process.exit(1);
  }

  const req = http.get(`http://localhost:${serverPort}/`, (res) => {
    console.log(`Server responded with status: ${res.statusCode}`);
    callback();
  });

  req.on('error', (err) => {
    console.log(`Waiting for server... (${retries} retries left)`);
    setTimeout(() => pollServer(callback, retries - 1, delay), delay);
  });

  req.end();
}

console.log('Starting ani-web...');

// Check and install root dependencies
checkAndInstall(rootDir, 'install --production', 'Root dependencies installed.', 'Root npm install failed!');

// Start backend server
console.log('Starting backend server...');
const serverProcess = spawn('cmd.exe', ['/c', 'npm run start-server'], {
  stdio: 'inherit',
});

serverProcess.on('error', (err) => {
  console.error('Failed to start backend server process.', err);
  process.exit(1);
});

serverProcess.on('exit', (code, signal) => {
  if (code !== 0) {
    console.error(`Backend server exited with code ${code} and signal ${signal}`);
  }
});

// Poll server until it's ready, then start frontend
pollServer(() => {
  // Check and install frontend dependencies
  checkAndInstall(frontendDir, 'install', 'Frontend dependencies installed.', 'Frontend npm install failed!');

  // Start frontend development server
  console.log('Starting frontend development server...');
  spawn('cmd.exe', ['/c', 'npm run start-frontend'], { stdio: 'inherit', cwd: rootDir });
  console.log('Frontend available at http://localhost:5173');
});