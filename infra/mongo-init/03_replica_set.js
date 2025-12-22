// MongoDB Replica Set Initialization Script
// This script is executed by mongodb-init container after all nodes are healthy

print('=== Starting Replica Set Initialization ===');

// Check if replica set is already initialized
try {
  const rsStatus = rs.status();
  print('Replica set already initialized:');
  printjson(rsStatus);
  print('Skipping initialization.');
  quit(0);
} catch (e) {
  print('Replica set not initialized yet, proceeding with initialization...');
}

// Initialize replica set with 3 nodes
const config = {
  _id: 'rs0',
  version: 1,
  members: [
    {
      _id: 0,
      host: 'mongodb-primary:27017',
      priority: 2
    },
    {
      _id: 1,
      host: 'mongodb-secondary1:27017',
      priority: 1
    },
    {
      _id: 2,
      host: 'mongodb-secondary2:27017',
      priority: 1
    }
  ]
};

print('Initiating replica set with config:');
printjson(config);

const result = rs.initiate(config);
printjson(result);

if (result.ok !== 1) {
  print('ERROR: Failed to initiate replica set');
  quit(1);
}

print('Replica set initiated successfully. Waiting for PRIMARY election...');

// Wait for primary election (max 30 seconds)
let isPrimary = false;
let attempts = 0;
const maxAttempts = 30;

while (!isPrimary && attempts < maxAttempts) {
  sleep(1000);
  attempts++;

  try {
    const status = rs.status();
    const primaryCount = status.members.filter(m => m.stateStr === 'PRIMARY').length;

    if (primaryCount === 1) {
      isPrimary = true;
      print(`PRIMARY elected after ${attempts} seconds`);
      printjson(status);
    } else {
      print(`Waiting for PRIMARY... (attempt ${attempts}/${maxAttempts})`);
    }
  } catch (e) {
    print(`Error checking status: ${e.message}`);
  }
}

if (!isPrimary) {
  print('ERROR: PRIMARY was not elected within timeout');
  quit(1);
}

// Verify all nodes are in the replica set
print('=== Final Replica Set Status ===');
const finalStatus = rs.status();
printjson(finalStatus);

print('=== Replica Set Members ===');
finalStatus.members.forEach(member => {
  print(`- ${member.name}: ${member.stateStr} (health: ${member.health})`);
});

print('=== Replica Set Initialization Complete ===');
