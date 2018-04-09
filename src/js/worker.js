/*
Created by Freshek on 07.10.2017
*/
window.globalSettings = new GlobalSettings();
var api;

$(document).ready(function () {
  api = new Api();

  var preloader = $("#preloader").attr("wmode", "opaque");
  $("#preloader").remove();

  var check = SafetyChecker.check();

  if (check !== true) {
    var warning = jQuery("<div>");
    warning.css({
      top: 0,
      left: 0,
      position: "absolute",
      width: "100%",
      height: "100%",
      backgroundColor: "gray",
      textAlign: "center"
    });

    jQuery("<h1>").text("The tool detected changes in the game.").appendTo(warning);
    jQuery("<h2>").text("Loading stopped! Your account has to stay safe.").appendTo(warning);
    jQuery("<h3>").text("Reason: " + check).appendTo(warning);

    warning.appendTo("body");
    throw new Error("Safety tests failed!");
  }

  preloader.appendTo($("#container"));

  window.settings = new Settings();
  window.initialized = false;
  window.reviveCount = 0;

  window.movementDone = true;

  var hm = new HandlersManager(api);

  hm.registerCommand(BoxInitHandler.ID, new BoxInitHandler());
  hm.registerCommand(ShipAttackHandler.ID, new ShipAttackHandler());
  hm.registerCommand(ShipCreateHandler.ID, new ShipCreateHandler());
  hm.registerCommand(ShipMoveHandler.ID, new ShipMoveHandler());
  hm.registerCommand(AssetRemovedHandler.ID, new AssetRemovedHandler());
  hm.registerCommand(HeroInitHandler.ID, new HeroInitHandler(init));
  hm.registerCommand(ShipDestroyedHandler.ID, new ShipDestroyedHandler());
  hm.registerCommand(ShipRemovedHandler.ID, new ShipRemovedHandler());
  hm.registerCommand(GateInitHandler.ID, new GateInitHandler());
  hm.registerCommand(ShipSelectedHandler.ID, new ShipSelectedHandler());
  hm.registerCommand(MessagesHandler.ID, new MessagesHandler());
  hm.registerCommand(HeroDiedHandler.ID, new HeroDiedHandler());
  hm.registerCommand(HeroUpdateHitpointsHandler.ID, new HeroUpdateHitpointsHandler());

  hm.registerEvent("updateHeroPos", new HeroPositionUpdateEventHandler());
  hm.registerEvent("movementDone", new MovementDoneEventHandler());

  hm.listen();
});

function init() {
  if (window.initialized)
    return;

  window.minimap = new Minimap(api);
  window.minimap.createWindow();

  window.attackWindow = new AttackWindow();
  window.attackWindow.createWindow();

  window.generalSettingsWindow = new GeneralSettingsWindow();
  window.generalSettingsWindow.createWindow();

  window.autolockWindow = new AutolockWindow();
  window.autolockWindow.createWindow();

  window.npcSettingsWindow = new NpcSettingsWindow();
  window.npcSettingsWindow.createWindow();

  window.statisticWindow = new StatisticWindow();
  window.statisticWindow.createWindow();

  Injector.injectScriptFromResource("res/injectables/HeroPositionUpdater.js");

  window.setInterval(logic, window.globalSettings.timerTick);

  $(document).keypress(function keyLock(e) {
    var key = e.key;

    if (key == "x" || key == "z") {
      var maxDist = 1000;
      var finDist = 1000000;
      var finalShip;

      for (var property in api.ships) {
        var ship = api.ships[property];
        var dist = ship.distanceTo(window.hero.position);

        if ((ship.isNpc && window.settings.lockNpc && key == "x" && dist < maxDist && dist < finDist && (!window.settings.excludeNpcs || window.settings.getNpc(ship.name))) || (!ship.isNpc && ship.isEnemy && window.settings.lockPlayers && key == "z")) {
          finalShip = ship;
          finDist = dist;
        }
      }

      if (finalShip != null) {
        api.lockShip(finalShip);
        api.triedToLock = true;
        api.targetShip = finalShip;
        if (finalShip.isNpc && window.settings.autoAttackNpcs) {
          $(this).unbind("keypress", keyLock);
          setTimeout(() => {
            api.startLaserAttack();
            api.lastAttack = $.now();
            api.attacking = true;
            $(this).bind("keypress", keyLock);
          }, 500);
        } else if (!finalShip.isNpc && window.settings.autoAttack) {
          $(this).unbind("keypress", keyLock);
          setTimeout(() => {
            api.startLaserAttack();
            api.lastAttack = $.now();
            api.attacking = true;
            $(this).bind("keypress", keyLock);
          }, 500);
        }
      }


    }
  });
}

function logic() {
  if (api.isRepairing && window.hero.hp !== window.hero.maxHp) {
    return;
  } else if (api.isRepairing && window.hero.hp === window.hero.maxHp) {
    api.isRepairing = false;
  }

  if (api.heroDied && api.isDisconected)
    return;

  window.minimap.draw();

  if (window.settings.npcDontChase && window.settings.killNpcs) {
    setTimeout(() => {
      var ship = api.findNearestShip();
      if (window.settings.killNpcs && (ship.distance < 600 || !ship.ship) && api.targetShip == null) {
        api.lockShip(ship.ship);
        api.triedToLock = true;
        api.targetShip = ship.ship;
        api.startLaserAttack();
        api.lastAttack = $.now();
        api.attacking = true;
      } else {
        api.targetShip = null;
        api.attacking = false;
        api.triedToLock = false;
        api.lockedShip = null;
      }
    }, window.globalSettings.timerTick);
  }

  if (!window.settings.npcDontChase && api.targetBoxHash == null && api.targetShip == null || window.settings.npcDontChase && api.targetBoxHash == null) {
    if (MathUtils.percentFrom(window.hero.hp, window.hero.maxHp) < window.settings.repairWhenHpIsLowerThanPercent) {
      let gate = api.findNearestGate();
      if (gate.gate) {
        let x = gate.gate.position.x;
        let y = gate.gate.position.y;
        api.isRepairing = true;
        api.move(x, y);
        window.movementDone = false;
        return;
      }
    }

    var box = api.findNearestBox();
    var ship = api.findNearestShip();

    if (!window.settings.npcDontChase && (ship.distance > 1000 || !ship.ship) && (box.box) || window.settings.npcDontChase && box.box) {
      api.collectBox(box.box);
      api.targetBoxHash = box.box.hash;
      return;
    } else if (!window.settings.npcDontChase && ship.ship && ship.distance < 1000 && window.settings.killNpcs) {
      api.lockShip(ship.ship);
      api.triedToLock = true;
      api.targetShip = ship.ship;
      return;
    } else if (!window.settings.npcDontChase && ship.ship && window.settings.killNpcs) {
      ship.ship.update();
      api.move(ship.ship.position.x - MathUtils.random(-50, 50), ship.ship.position.y - MathUtils.random(-50, 50));
      api.targetShip = ship.ship;
      return;
    }

  }

  if (api.targetShip && window.settings.killNpcs) {
    if (!api.triedToLock && (api.lockedShip == null || api.lockedShip.id != api.targetShip.id)) {
      api.targetShip.update();
      var dist = api.targetShip.distanceTo(window.hero.position);
      if (dist < 600) {
        api.lockShip(api.targetShip);
        api.triedToLock = true;
        return;
      }
    }

    if (!api.attacking && api.lockedShip) {
      api.startLaserAttack();
      api.lastAttack = $.now();
      api.attacking = true;
      return;
    }
  }

  if (api.targetBoxHash && $.now() - api.collectTime > 5000) {
    let box = api.boxes[api.targetBoxHash];
    if (box && box.distanceTo(window.hero.position) > 1000) {
      api.collectTime = $.now();
    } else {
      delete api.boxes[api.targetBoxHash];
      api.blackListHash(api.targetBoxHash);
      api.targetBoxHash = null;
    }
  }

  //HACK: npc stucks fallback
  if ((api.targetShip && $.now() - api.lockTime > 5000 && !api.attacking) || $.now() - api.lastAttack > 25000) {
    api.targetShip = null;
    api.attacking = false;
    api.triedToLock = false;
    api.lockedShip = null;
  }

  var x;
  var y;

  if (!window.settings.npcDontChase && api.targetBoxHash == null && api.targetShip == null && window.movementDone && window.settings.moveRandomly || window.settings.npcDontChase && api.targetBoxHash == null && window.movementDone && window.settings.moveRandomly) {
    x = MathUtils.random(100, 20732);
    y = MathUtils.random(58, 12830);
  }

  if (!window.settings.npcDontChase && api.targetShip && window.settings.killNpcs && api.targetBoxHash == null) {
    api.targetShip.update();
    var dist = api.targetShip.distanceTo(window.hero.position);

    if ((dist > 600 && (api.lockedShip == null || api.lockedShip.id != api.targetShip.id) && $.now() - api.lastMovement > 1000)) {
      x = api.targetShip.position.x - MathUtils.random(-50, 50);
      y = api.targetShip.position.y - MathUtils.random(-50, 50);
      api.lastMovement = $.now();
    } else if (api.lockedShip && api.lockedShip.percentOfHp < 15 && api.lockedShip.id == api.targetShip.id && window.settings.dontCircleWhenHpBelow15Percent) {
      if (dist > 450) {
        x = api.targetShip.position.x + MathUtils.random(-30, 30);
        y = api.targetShip.position.y + MathUtils.random(-30, 30);
      }
    } else if (dist > 300 && api.lockedShip && api.lockedShip.id == api.targetShip.id & !window.settings.circleNpc) {
      x = api.targetShip.position.x + MathUtils.random(-200, 200);
      y = api.targetShip.position.y + MathUtils.random(-200, 200);
    } else if (api.lockedShip && api.lockedShip.id == api.targetShip.id) {
      if (window.settings.circleNpc) {
        //I'm not completely sure about this algorithm
        let enemy = api.targetShip.position;
        let f = Math.atan2(window.hero.position.x - enemy.x, window.hero.position.y - enemy.y) + 0.5;
        let s = Math.PI / 180;
        f += s;
        x = enemy.x + window.settings.npcCircleRadius * Math.sin(f);
        y = enemy.y + window.settings.npcCircleRadius * Math.cos(f);
      }
    } else { // ??? there must be something wrong with our locked npc
      api.targetShip = null;
      api.attacking = false;
      api.triedToLock = false;
      api.lockedShip = null;
    }
  }

  if (x && y) {
    api.move(x, y);
    window.movementDone = false;
  }

  window.dispatchEvent(new CustomEvent("logicEnd"));
}