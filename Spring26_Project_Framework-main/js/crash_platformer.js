import * as THREE from 'three';
import { ThreeEngine, convert_z_up_array_to_y_up_array, z_up_set_object_position } from './utils/utils_three.js';

const engine = ThreeEngine.new_default_3d();
const camera = engine.camera;
const statusElement = document.getElementById('status');

engine.controls.enabled = false;
engine.controls.enableRotate = false;
engine.controls.enableZoom = false;
engine.controls.enablePan = false;
engine.controls.update = () => {};
engine.camera.fov = 60;
engine.camera.near = 0.1;
engine.camera.far = 150;
engine.camera.updateProjectionMatrix();
engine.scene.background = new THREE.Color(0x86c86d);
engine.scene.fog = new THREE.Fog(0x86c86d, 18, 70);
engine.scene.children.slice().forEach((child) => {
    if (child.type === 'GridHelper' || child.type === 'LineSegments') {
        engine.scene.remove(child);
    }
});

document.title = 'Jungle Hallway Runner';

const keys = new Map();
window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'KeyX'].includes(event.code)) {
        event.preventDefault();
    }
    keys.set(event.code, true);
});
window.addEventListener('keyup', (event) => {
    keys.set(event.code, false);
});

const groundSegments = [];
const boxes = [];
const enemies = [];
const occluders = [];

const optimizationCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 150);
const tempRaycaster = new THREE.Raycaster();
const tempVecA = new THREE.Vector3();
const tempVecB = new THREE.Vector3();
const tempVecC = new THREE.Vector3();
const tempVecD = new THREE.Vector3();
const cameraCandidate = new THREE.Vector3();
const cameraGradient = new THREE.Vector3();

function zUpToYUpVector(x, y, z) {
    const converted = convert_z_up_array_to_y_up_array([x, y, z]);
    return new THREE.Vector3(converted[0], converted[1], converted[2]);
}

function clamp(value, minValue, maxValue) {
    return Math.max(minValue, Math.min(maxValue, value));
}

function createCube(width, height, depth, color) {
    return new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshBasicMaterial({ color })
    );
}

function addSceneCube(width, height, depth, color, x, y, z) {
    const mesh = createCube(width, height, depth, color);
    z_up_set_object_position(mesh, x, y, z);
    engine.scene.add(mesh);
    return mesh;
}

function addGroundSegment(x, y, width, depth, topZ, color) {
    const thickness = 0.4;
    addSceneCube(width, thickness, depth, color, x, y, topZ - thickness / 2);
    groundSegments.push({
        xMin: x - width / 2,
        xMax: x + width / 2,
        yMin: y - depth / 2,
        yMax: y + depth / 2,
        topZ,
    });
}

function addObstacleBox(x, y, z, width, depth, height, color, kind = 'box') {
    const mesh = addSceneCube(width, height, depth, color, x, y, z);
    const object = {
        mesh,
        kind,
        x,
        y,
        z,
        width,
        depth,
        height,
        dead: false,
    };
    boxes.push(object);
    occluders.push(mesh);
    return object;
}

function addSideTree(x, y, baseZ, scale = 1) {
    const trunkHeight = 1.4 * scale;
    const trunk = addSceneCube(0.35 * scale, trunkHeight, 0.35 * scale, 0x70543b, x, y, baseZ + trunkHeight / 2);
    addSceneCube(1.1 * scale, 0.9 * scale, 1.1 * scale, 0x2f8f44, x, y, baseZ + trunkHeight + 0.45 * scale);
    addSceneCube(0.8 * scale, 0.7 * scale, 0.8 * scale, 0x66b84f, x + 0.28 * scale, y - 0.15 * scale, baseZ + trunkHeight + 0.95 * scale);
    addSceneCube(0.75 * scale, 0.65 * scale, 0.75 * scale, 0x3e9e4f, x - 0.25 * scale, y + 0.2 * scale, baseZ + trunkHeight + 0.8 * scale);
    occluders.push(trunk);
}

function updateGroupPosition(object3D, position) {
    z_up_set_object_position(object3D, position.x, position.y, position.z);
}

function buildPlayer() {
    const group = new THREE.Group();

    const lowerCube = createCube(1.0, 0.85, 1.0, 0x1f5aa6);
    lowerCube.position.set(0, 0, 0.425);
    group.add(lowerCube);

    const upperCube = createCube(1.45, 1.2, 1.45, 0xf28a26);
    upperCube.position.set(0, 0, 1.25);
    group.add(upperCube);

    const snout = createCube(0.48, 0.42, 0.42, 0xffd16a);
    snout.position.set(0.72, 0, 1.08);
    group.add(snout);

    const eyeL = createCube(0.12, 0.12, 0.12, 0xfefefe);
    eyeL.position.set(0.35, 0.42, 1.75);
    group.add(eyeL);

    const eyeR = createCube(0.12, 0.12, 0.12, 0xfefefe);
    eyeR.position.set(0.35, -0.42, 1.75);
    group.add(eyeR);

    const nose = createCube(0.08, 0.08, 0.08, 0x2b160c);
    nose.position.set(0.94, 0, 1.07);
    group.add(nose);

    engine.scene.add(group);

    return {
        group,
        position: new THREE.Vector3(-1.5, 1.8, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        facing: 1,
        forward: new THREE.Vector2(0, 1),
        baseYaw: 0,
        // Base rotation to orient the model upright (fix lying-on-back default)
        baseRotation: new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'),
        onGround: false,
        jumpFlipTimer: 0,
        jumpFlipDuration: 0.7,
        spinTimer: 0,
        spinDuration: 0.35,
        spinCooldown: 0,
        hurtTimer: 0,
        width: 1.3,
        depth: 1.2,
        height: 2.2,
    };
}

function buildCrab(x, y, z) {
    const group = new THREE.Group();

    const shell = createCube(1.2, 0.55, 0.7, 0xd64434);
    shell.position.set(0, 0, 0.35);
    group.add(shell);

    const clawL = createCube(0.35, 0.25, 0.25, 0xf15c47);
    clawL.position.set(0.72, 0.45, 0.28);
    group.add(clawL);

    const clawR = createCube(0.35, 0.25, 0.25, 0xf15c47);
    clawR.position.set(0.72, -0.45, 0.28);
    group.add(clawR);

    const eyeL = createCube(0.08, 0.08, 0.62, 0xffe9e3);
    eyeL.position.set(0.05, 0.18, 0.82);
    group.add(eyeL);

    const eyeR = createCube(0.08, 0.08, 0.62, 0xffe9e3);
    eyeR.position.set(0.05, -0.18, 0.82);
    group.add(eyeR);

    const eyeDotL = createCube(0.09, 0.09, 0.09, 0x232323);
    eyeDotL.position.set(0.11, 0.18, 1.12);
    group.add(eyeDotL);

    const eyeDotR = createCube(0.09, 0.09, 0.09, 0x232323);
    eyeDotR.position.set(0.11, -0.18, 1.12);
    group.add(eyeDotR);

    engine.scene.add(group);

    const enemy = {
        group,
        position: new THREE.Vector3(x, y, z),
        direction: Math.random() > 0.5 ? 1 : -1,
        speed: 1.05,
        rangeMin: x - 2.2,
        rangeMax: x + 2.2,
        dead: false,
        width: 1.4,
        depth: 1.0,
        height: 1.1,
    };

    updateGroupPosition(group, enemy.position);
    enemies.push(enemy);
    occluders.push(group);
    return enemy;
}

function getEntityBox(entity) {
    const centerX = entity.position ? entity.position.x : entity.x;
    const centerY = entity.position ? entity.position.y : entity.y;
    const centerZ = entity.position ? entity.position.z : entity.z;
    return new THREE.Box3(
        new THREE.Vector3(centerX - entity.width / 2, centerY - entity.depth / 2, centerZ),
        new THREE.Vector3(centerX + entity.width / 2, centerY + entity.depth / 2, centerZ + entity.height)
    );
}

function getGroundHeight(x, y) {
    let bestHeight = 0;
    for (const segment of groundSegments) {
        if (x >= segment.xMin && x <= segment.xMax && y >= segment.yMin && y <= segment.yMax) {
            bestHeight = Math.max(bestHeight, segment.topZ);
        }
    }
    return bestHeight;
}

function resolvePlayerObstacleCollision(object) {
    const playerBox = new THREE.Box3(
        new THREE.Vector3(player.position.x - player.width / 2, player.position.y - player.depth / 2, player.position.z),
        new THREE.Vector3(player.position.x + player.width / 2, player.position.y + player.depth / 2, player.position.z + player.height)
    );
    const obstacleBox = getEntityBox(object);

    if (!playerBox.intersectsBox(obstacleBox)) {
        return;
    }

    const overlapX = Math.min(playerBox.max.x, obstacleBox.max.x) - Math.max(playerBox.min.x, obstacleBox.min.x);
    const overlapY = Math.min(playerBox.max.y, obstacleBox.max.y) - Math.max(playerBox.min.y, obstacleBox.min.y);
    const overlapZ = Math.min(playerBox.max.z, obstacleBox.max.z) - Math.max(playerBox.min.z, obstacleBox.min.z);

    if (overlapX <= overlapY && overlapX <= overlapZ) {
        if (player.position.x < (object.position ? object.position.x : object.x)) {
            player.position.x -= overlapX + 0.01;
        } else {
            player.position.x += overlapX + 0.01;
        }
        player.velocity.x = 0;
        return;
    }

    if (overlapY <= overlapX && overlapY <= overlapZ) {
        if (player.position.y < (object.position ? object.position.y : object.y)) {
            player.position.y -= overlapY + 0.01;
        } else {
            player.position.y += overlapY + 0.01;
        }
        player.velocity.y = 0;
        return;
    }

    if (player.position.z < (object.position ? object.position.z : object.z)) {
        player.position.z -= overlapZ + 0.01;
        player.velocity.z = Math.min(player.velocity.z, 0);
    } else {
        player.position.z += overlapZ + 0.01;
        player.velocity.z = Math.max(player.velocity.z, 0);
        player.onGround = true;
    }
}

function destroyEntity(entity) {
    entity.dead = true;
    entity.group.visible = false;
}

function updateEnemy(enemy, deltaTime) {
    if (enemy.dead) {
        return;
    }

    enemy.position.x += enemy.direction * enemy.speed * deltaTime;
    if (enemy.position.x < enemy.rangeMin) {
        enemy.position.x = enemy.rangeMin;
        enemy.direction = 1;
    } else if (enemy.position.x > enemy.rangeMax) {
        enemy.position.x = enemy.rangeMax;
        enemy.direction = -1;
    }

    updateGroupPosition(enemy.group, enemy.position);
}

function updateBoxes() {
    for (const box of boxes) {
        if (!box.dead) {
            updateGroupPosition(box.mesh, new THREE.Vector3(box.x, box.y, box.z));
        }
    }
}

function updateSpinAttack() {
    if (player.spinTimer <= 0) {
        return;
    }

    const attackRadius = 1.45;
    const playerCenter = new THREE.Vector3(player.position.x, player.position.y, player.position.z + player.height * 0.55);

    for (const box of boxes) {
        if (box.dead) {
            continue;
        }
        const boxCenter = new THREE.Vector3(box.x, box.y, box.z + box.height * 0.5);
        if (boxCenter.distanceTo(playerCenter) <= attackRadius) {
            destroyEntity(box);
        }
    }

    for (const enemy of enemies) {
        if (enemy.dead) {
            continue;
        }
        const enemyCenter = new THREE.Vector3(enemy.position.x, enemy.position.y, enemy.position.z + enemy.height * 0.5);
        if (enemyCenter.distanceTo(playerCenter) <= attackRadius) {
            destroyEntity(enemy);
        }
    }
}


function buildLevel() {
    addGroundSegment(0, 9, 7.0, 18.0, 0, 0x6d8f45);
    addGroundSegment(0, 20, 7.0, 8.0, 0.6, 0x7b9951);
    addGroundSegment(0, 25, 7.0, 8.0, 1.2, 0x87a95c);
    addGroundSegment(0, 31, 7.0, 12.0, 1.8, 0x8cb25e);
    addGroundSegment(0, 41, 7.0, 18.0, 2.4, 0x96bc68);

    for (let i = -1; i <= 16; i++) {
        const y = 1.5 + i * 2.5;
        addSideTree(-5.3, y, 0, 0.95 + (i % 3) * 0.05);
        addSideTree(5.3, y + 0.8, 0, 0.95 + ((i + 1) % 3) * 0.05);
    }

    for (let i = 0; i < 8; i++) {
        addSceneCube(0.7, 0.5, 0.7, 0x2d6b3d, -4.4, 4.5 + i * 4.5, 0.2);
        addSceneCube(0.7, 0.5, 0.7, 0x2d6b3d, 4.4, 6.5 + i * 4.5, 0.2);
    }

    const crateData = [
        [-1.6, 7.2, 0.55],
        [0.0, 8.8, 0.55],
        [1.4, 10.4, 0.55],
        [-1.2, 13.0, 0.55],
        [1.0, 14.6, 0.55],
        [-0.9, 18.8, 1.15],
        [1.15, 21.3, 1.75],
        [-1.0, 27.2, 2.35],
        [1.3, 33.4, 2.95],
    ];

    crateData.forEach(([x, y, z]) => {
        addObstacleBox(x, y, z, 0.85, 0.85, 0.85, 0xcc9d1a, 'box');
    });

    addObstacleBox(-2.8, 16.0, 0.75, 0.5, 3.0, 1.5, 0x4a3724, 'wall');
    addObstacleBox(2.8, 23.0, 1.35, 0.5, 4.0, 2.7, 0x4a3724, 'wall');
    addObstacleBox(-2.8, 35.0, 2.15, 0.5, 4.5, 4.3, 0x4a3724, 'wall');

    [[0, 18.8, 0.3], [0, 19.8, 0.9], [0, 20.8, 1.5], [0, 21.8, 2.1]].forEach(([x, y, topZ]) => {
        addGroundSegment(x, y, 4.0, 1.05, topZ, 0x8aa35d);
    });

    [[0, 29.0, 1.5], [0, 30.0, 1.8], [0, 31.0, 2.1], [0, 32.0, 2.4]].forEach(([x, y, topZ]) => {
        addGroundSegment(x, y, 4.0, 1.05, topZ, 0x91ab67);
    });

    buildCrab(-1.8, 12.4, 0.55);
    buildCrab(1.8, 17.8, 1.25);
    buildCrab(-1.4, 27.8, 2.45);
    buildCrab(1.6, 38.5, 3.05);
}

function updatePlayer(deltaTime) {
    const moveLeft = keys.get('ArrowLeft') ? 1 : 0;
    const moveRight = keys.get('ArrowRight') ? 1 : 0;
    const moveForward = keys.get('ArrowUp') ? 1 : 0;
    const moveBackward = keys.get('ArrowDown') ? 1 : 0;
    const jumpPressed = keys.get('Space');
    const spinPressed = keys.get('KeyX') || keys.get('ShiftLeft');

    const inputX = moveRight - moveLeft;
    const inputY = moveForward - moveBackward;
    const moveLength = Math.hypot(inputX, inputY) || 1;
    const inputMag = Math.hypot(inputX, inputY);
    const desiredSpeed = 3.6;
    const desiredVX = (inputX / moveLength) * desiredSpeed * (inputX !== 0 || inputY !== 0 ? 1 : 0);
    const desiredVY = (inputY / moveLength) * desiredSpeed * (inputX !== 0 || inputY !== 0 ? 1 : 0);
    const acceleration = player.onGround ? 18 : 9;

    player.velocity.x += (desiredVX - player.velocity.x) * clamp(acceleration * deltaTime, 0, 1);
    player.velocity.y += (desiredVY - player.velocity.y) * clamp(acceleration * deltaTime, 0, 1);

    // Update facing and forward direction when movement keys pressed
    if (inputMag > 0.001) {
        const nx = inputX / inputMag;
        const ny = inputY / inputMag;
        player.forward.set(nx, ny);
        player.baseYaw = Math.atan2(-nx, ny);
        player.facing = player.forward.y >= 0 ? 1 : -1;
    } else if (Math.abs(player.velocity.y) > 0.1) {
        player.facing = player.velocity.y >= 0 ? 1 : -1;
    }

    if (jumpPressed && player.onGround) {
        player.velocity.z = 9.2;
        player.onGround = false;
        // Determine if the jump is in the forward direction to trigger a front flip
        let movementDirX = 0;
        let movementDirY = 0;
        if (inputMag > 0.001) {
            movementDirX = inputX / inputMag;
            movementDirY = inputY / inputMag;
        } else {
            const velMag = Math.hypot(player.velocity.x, player.velocity.y);
            if (velMag > 0.25) {
                movementDirX = player.velocity.x / velMag;
                movementDirY = player.velocity.y / velMag;
            }
        }
        const dot = movementDirX * player.forward.x + movementDirY * player.forward.y;
        if (dot > 0.5) {
            player.jumpFlipTimer = player.jumpFlipDuration;
        }
    }

    if (spinPressed && player.spinCooldown <= 0 && player.spinTimer <= 0) {
        player.spinTimer = player.spinDuration;
        player.spinCooldown = 0.25;
    }

    player.spinCooldown = Math.max(0, player.spinCooldown - deltaTime);
    player.spinTimer = Math.max(0, player.spinTimer - deltaTime);
    player.jumpFlipTimer = Math.max(0, player.jumpFlipTimer - deltaTime);
    player.hurtTimer = Math.max(0, player.hurtTimer - deltaTime);

    player.velocity.z -= 16.5 * deltaTime;
    player.position.x += player.velocity.x * deltaTime;
    player.position.y += player.velocity.y * deltaTime;
    player.position.z += player.velocity.z * deltaTime;

    player.position.x = clamp(player.position.x, -2.2, 2.2);
    player.position.y = clamp(player.position.y, 0.3, 44.5);

    const groundHeight = getGroundHeight(player.position.x, player.position.y);
    if (player.position.z < groundHeight) {
        player.position.z = groundHeight;
        player.velocity.z = 0;
        player.onGround = true;
    } else {
        player.onGround = false;
    }

    for (const obstacle of boxes) {
        if (obstacle.dead || obstacle.kind !== 'wall') {
            continue;
        }
        resolvePlayerObstacleCollision(obstacle);
    }

    for (const box of boxes) {
        if (box.dead || player.spinTimer > 0) {
            continue;
        }
        resolvePlayerObstacleCollision(box);
    }

    for (const enemy of enemies) {
        if (enemy.dead || player.spinTimer > 0) {
            continue;
        }
        if (getEntityBox(player).intersectsBox(getEntityBox(enemy))) {
            if (player.position.x < enemy.position.x) {
                player.position.x -= 0.05;
            } else {
                player.position.x += 0.05;
            }
            player.velocity.x *= -0.2;
            player.velocity.y *= 0.2;
            player.hurtTimer = 0.25;
        }
    }

    updateSpinAttack();

    const walkBob = player.onGround ? Math.sin(engine.get_time_elapsed() * 12) * 0.07 * Math.min(1, Math.hypot(player.velocity.x, player.velocity.y) / 3.2) : 0;
    const spinAngle = player.spinTimer > 0 ? (1 - player.spinTimer / player.spinDuration) * Math.PI * 8 : 0;
    const flipAngle = player.jumpFlipTimer > 0 ? (1 - player.jumpFlipTimer / player.jumpFlipDuration) * Math.PI * 2 : 0;

    // Compose base upright rotation, a flip around the lateral axis
    // (perpendicular to the forward vector), and yaw+spin around Z.
    const qBase = new THREE.Quaternion().setFromEuler(player.baseRotation);
    const flipAxis = new THREE.Vector3(player.forward.y, -player.forward.x, 0);
    if (flipAxis.lengthSq() < 1e-6) {
        flipAxis.set(0, 1, 0);
    }
    flipAxis.normalize();
    const qFlip = new THREE.Quaternion().setFromAxisAngle(flipAxis, -flipAngle);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), player.baseYaw + spinAngle);
    const qTotal = qBase.clone().multiply(qFlip).multiply(qYaw);
    player.group.quaternion.copy(qTotal);
    z_up_set_object_position(player.group, player.position.x, player.position.y, player.position.z + 0.05 + walkBob);
}

function updateEnemyLogic(deltaTime) {
    for (const enemy of enemies) {
        updateEnemy(enemy, deltaTime);
        if (!enemy.dead && player.spinTimer > 0) {
            const playerCenter = new THREE.Vector3(player.position.x, player.position.y, player.position.z + 1.1);
            const enemyCenter = new THREE.Vector3(enemy.position.x, enemy.position.y, enemy.position.z + 0.55);
            if (enemyCenter.distanceTo(playerCenter) <= 1.45) {
                destroyEntity(enemy);
            }
        }
    }
}

function updateCamera() {
    const cameraPosition = zUpToYUpVector(0, player.position.y - 6.0, 3.2);

    camera.position.copy(cameraPosition);
}

function updateHUD() {
    const remainingBoxes = boxes.filter((box) => !box.dead).length;
    const remainingCrabs = enemies.filter((enemy) => !enemy.dead).length;
    statusElement.textContent = `Boxes left: ${remainingBoxes} | Crabs left: ${remainingCrabs} | Spin with X`;
}

function updateScene() {
    const deltaTime = Math.min(engine.get_delta_time_from_last_frame(), 0.033);
    updatePlayer(deltaTime);
    updateEnemyLogic(deltaTime);
    updateBoxes();
    updateCamera();
    updateHUD();
}

const player = buildPlayer();
buildLevel();
updateGroupPosition(player.group, player.position);
const initialCameraPosition = zUpToYUpVector(0, -5.8, 8.0);
camera.position.copy(initialCameraPosition);
camera.lookAt(zUpToYUpVector(0, player.position.y + 20.0, player.position.z + 1.15));

engine.animation_loop(() => {
    updateScene();
});
