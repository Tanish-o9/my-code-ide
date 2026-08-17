exports.activate = function() {
  console.log("Mock Extension Activated successfully!");
  
  antigravity.commands.registerCommand("mock.infiniteLoop", function() {
    console.log("Triggering infinite loop in extension!");
    while(true) {}
  });

  antigravity.commands.registerCommand("mock.crash", function() {
    console.log("Triggering crash in extension!");
    process.exit(42);
  });

  antigravity.commands.registerCommand("mock.unauthorizedWrite", function() {
    return antigravity.workspace.writeFile("test.txt", "unauthorized content");
  });
};
