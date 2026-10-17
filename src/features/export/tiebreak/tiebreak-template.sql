-- Tiebreak Tech match database: schema and code tables only (no match or personal data).
-- Generated from a real Tiebreak Tech export; used as the template for .db export.
CREATE TABLE IF NOT EXISTS "d_SERVE_type"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "team"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "name" VARCHAR(45),
  "ourteam" BIT
);
CREATE TABLE IF NOT EXISTS "d_IP_fondamentale"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "d_OP_othertype"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "ruolo"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "manifestazione"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "d_ATT_base"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "d_ERROR_type"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "d_special_codes"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "d_pos_wrt_body"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "d_ATT_type"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "d_DIG_type"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "d_BLOCK_type"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "d_SET_type"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "d_SET_chiamata"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
, long_descr VARCHAR(100), target_attk TEXT DEFAULT NULL, coord INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS "d_SERVE_distance"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "descr" VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "game"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "home_team" INTEGER,
  "visitors_team" INTEGER,
  "homescore" INTEGER,
  "visitorscore" INTEGER,
  "date" INTEGER,
  "manifestazione" INTEGER,
  "giornata_campionato" INTEGER,
  CONSTRAINT "fk_home_team"
    FOREIGN KEY("home_team")
    REFERENCES "team"("id"),
  CONSTRAINT "fk_visitors_team"
    FOREIGN KEY("visitors_team")
    REFERENCES "team"("id"),
  CONSTRAINT "fk_manifestazione"
    FOREIGN KEY("manifestazione")
    REFERENCES "manifestazione"("id")
);
CREATE TABLE IF NOT EXISTS "sset"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "game" INTEGER,
  "homescore" INTEGER,
  "visitorscore" INTEGER,
  "duration" INTEGER,-- duration in minutes
  "homeserve" BIT,
  "sset_number" INTEGER,
  "open" BIT,
  CONSTRAINT "fk_game"
    FOREIGN KEY("game")
    REFERENCES "game"("id")
    ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "player"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "name" VARCHAR(45),
  "current_team" INTEGER,
  "jersey" INTEGER,
  "birth" INTEGER,
  "default_role" INTEGER,
  "titolare" BIT,
  "surname" VARCHAR(45),
  "nationality" VARCHAR(45), lefty BIT NOT NULL DEFAULT 0,
  CONSTRAINT "fk_current_team"
    FOREIGN KEY("current_team")
    REFERENCES "team"("id")
    ON UPDATE CASCADE,
  CONSTRAINT "fk_default_role"
    FOREIGN KEY("default_role")
    REFERENCES "ruolo"("id")
);
CREATE TABLE IF NOT EXISTS "event"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "sset" INTEGER,
  "time" INTEGER,
  "homescore" INTEGER,
  "visitorscore" INTEGER,
  "inplay" BIT,
  "ERROR" BIT,
  "IP_player" INTEGER,
  "IP_fondamentale" INTEGER,
  "OP_other_type" INTEGER,
  "mark" INTEGER,
  "pos_palleggiatore" INTEGER,
  "pos_giocatore" INTEGER,
  "ATT_cono" INTEGER,
  "ATT_breakpoint" BIT,
  "ATT_base" INTEGER,
  "SERVE_direction" INTEGER,
  "SERVE_type" INTEGER,
  "team" INTEGER,
  "SUBSTITUTION_player_in" INTEGER,
  "SUBSTITUTION_player_out" INTEGER,
  "ERROR_type" INTEGER,
  "mark_t_minus_one" INTEGER,
  "mark_t_minus_two" INTEGER,
  "SERVE_from" INTEGER,
  "special_code" INTEGER,
  "REC_num_players" INTEGER,
  "pos_wrt_body" INTEGER,
  "ATT_type" INTEGER,
  "num_giocatori_muro" INTEGER,
  "DIG_type" INTEGER,
  "BLOCK_type" INTEGER,
  "BLOCK_num_players" INTEGER,
  "azione" INTEGER,
  "opponent_setterpos" INTEGER,
  "SET_type" INTEGER,
  "SET_chiamata" INTEGER,
  "SERVE_distance" INTEGER,
  "dummy1" INTEGER,
  "dummy2" INTEGER,
  "dummy3" INTEGER,
  "dummy4" INTEGER,
  "dummy5" INTEGER,
  "dummy6" INTEGER,
  "dummy7" INTEGER,
  "correlated_id" INTEGER,
  "dummy9" INTEGER, "SERVE_speed" INTEGER DEFAULT NULL, custom TEXT, zp_x SMALLINT DEFAULT NULL, zp_y SMALLINT DEFAULT NULL, za_x SMALLINT DEFAULT NULL, za_y SMALLINT DEFAULT NULL,
  CONSTRAINT "fk_SER_type"
    FOREIGN KEY("SERVE_type")
    REFERENCES "d_SERVE_type"("id")
    ON UPDATE CASCADE,
  CONSTRAINT "fk_sset"
    FOREIGN KEY("sset")
    REFERENCES "sset"("id"),
  CONSTRAINT "fk_IP_player"
    FOREIGN KEY("IP_player")
    REFERENCES "player"("id"),
  CONSTRAINT "fk_IP_fondamentale"
    FOREIGN KEY("IP_fondamentale")
    REFERENCES "d_IP_fondamentale"("id"),
  CONSTRAINT "fk_OP_othertype"
    FOREIGN KEY("OP_other_type")
    REFERENCES "d_OP_othertype"("id"),
  CONSTRAINT "fk_ATT_base"
    FOREIGN KEY("ATT_base")
    REFERENCES "d_ATT_base"("id"),
  CONSTRAINT "fk_ERROR_type"
    FOREIGN KEY("ERROR_type")
    REFERENCES "d_ERROR_type"("id"),
  CONSTRAINT "fk_special_code"
    FOREIGN KEY("special_code")
    REFERENCES "d_special_codes"("id"),
  CONSTRAINT "fk_REC_where"
    FOREIGN KEY("pos_wrt_body")
    REFERENCES "d_pos_wrt_body"("id"),
  CONSTRAINT "fk_DIG_type"
    FOREIGN KEY("DIG_type")
    REFERENCES "d_DIG_type"("id"),
  CONSTRAINT "fk_BLOCK_type"
    FOREIGN KEY("BLOCK_type")
    REFERENCES "d_BLOCK_type"("id"),
  CONSTRAINT "fk_azione"
    FOREIGN KEY("azione")
    REFERENCES "azione"("id"),
  CONSTRAINT "fk_SET_type"
    FOREIGN KEY("SET_type")
    REFERENCES "d_SET_type"("id"),
  CONSTRAINT "fk_SET_chiamata"
    FOREIGN KEY("SET_chiamata")
    REFERENCES "d_SET_chiamata"("id"),
  CONSTRAINT "fk_SERVE_distance"
    FOREIGN KEY("SERVE_distance")
    REFERENCES "d_SERVE_distance"("id")
);
CREATE TABLE IF NOT EXISTS "azione"(
  "id" INTEGER PRIMARY KEY NOT NULL,
  "start_event" INTEGER,
  "end_event" INTEGER,
  "type" INTEGER,
  "p1" INTEGER,
  "p2" INTEGER,
  "p3" INTEGER,
  "p4" INTEGER,
  "p5" INTEGER,
  "p6" INTEGER,
  "q1" INTEGER,
  "q2" INTEGER,
  "q3" INTEGER,
  "q4" INTEGER,
  "q5" INTEGER,
  "q6" INTEGER, team_won INTEGER,
  CONSTRAINT "fk_start_event"
    FOREIGN KEY("start_event")
    REFERENCES "event"("id"),
  CONSTRAINT "fk_end_event"
    FOREIGN KEY("end_event")
    REFERENCES "event"("id")
);
CREATE TABLE IF NOT EXISTS "rotations"(
"rot_id" INTEGER PRIMARY KEY NOT NULL, 
"event_id" INTEGER, 
"sset_id" INTEGER, 
"game_id" INTEGER, 
"pos0" INTEGER, 
"pos1" INTEGER, 
"homeserve" BIT, 
"subst" BIT DEFAULT 0, 
"forced" BIT DEFAULT 0, 
"pl0_1" INTEGER,
"pl0_2" INTEGER,
"pl0_3" INTEGER,
"pl0_4" INTEGER,
"pl0_5" INTEGER,
"pl0_6" INTEGER,
"l0" INTEGER,
"l0_pos" INTEGER,
"pl1_1" INTEGER,
"pl1_2" INTEGER,
"pl1_3" INTEGER,
"pl1_4" INTEGER,
"pl1_5" INTEGER,
"pl1_6" INTEGER,
"l1" INTEGER,
"l1_pos" INTEGER,
CONSTRAINT "fk_event" FOREIGN KEY("event_id") REFERENCES "event"("id") ON DELETE CASCADE,
CONSTRAINT "fk_sset" FOREIGN KEY("sset_id") REFERENCES "sset"("id") ON DELETE CASCADE,
CONSTRAINT "fk_game" FOREIGN KEY("game_id") REFERENCES "game"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "staff_role"(
"role_id" INTEGER PRIMARY KEY NOT NULL, 
"name" VARCHAR(45) 
);
CREATE TABLE IF NOT EXISTS "staff"(
"member_id" INTEGER PRIMARY KEY NOT NULL, 
"name" VARCHAR(45), 
"team_id" INTEGER, 
"role_id" INTEGER, nationality INTEGER, idcard VARCHAR(45), fedcode VARCHAR(45), missing INTEGER NOT NULL DEFAULT 0, 
CONSTRAINT "fk_role" FOREIGN KEY("role_id") REFERENCES "staff_roles"("role_id") ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "player_stuff"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"value" VARCHAR(45), 
"player_id" INTEGER, 
"type_id" INTEGER, 
CONSTRAINT "fk_type" FOREIGN KEY("type_id") REFERENCES "player_stuff_types"("type_id") ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "player_stuff_types"(
"type_id" INTEGER PRIMARY KEY NOT NULL, 
"name" VARCHAR(45) 
);
CREATE TABLE IF NOT EXISTS "convocazioni"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"game_id" INTEGER NOT NULL, 
"team_id" INTEGER NOT NULL, 
"player_id" INTEGER NOT NULL, 
"jersey" INTEGER NOT NULL, 
"role_id" INTEGER NOT NULL, 
"starting_pos" INTEGER NOT NULL, captain BIT DEFAULT 0, starting_pos2 INTEGER NOT NULL DEFAULT 0, starting_pos3 INTEGER NOT NULL DEFAULT 0, starting_pos4 INTEGER NOT NULL DEFAULT 0, starting_pos5 INTEGER NOT NULL DEFAULT 0, starting_pos6 INTEGER NOT NULL DEFAULT 0, starting_pos7 INTEGER NOT NULL DEFAULT 0, starting_pos8 INTEGER NOT NULL DEFAULT 0, starting_pos9 INTEGER NOT NULL DEFAULT 0, under BIT NOT NULL DEFAULT 0, availability INTEGER NOT NULL DEFAULT 0, 
CONSTRAINT "fk_game" FOREIGN KEY("game_id") REFERENCES "game"("id") ON UPDATE CASCADE
CONSTRAINT "fk_team" FOREIGN KEY("team_id") REFERENCES "team"("id") ON UPDATE CASCADE
CONSTRAINT "fk_player" FOREIGN KEY("player_id") REFERENCES "player"("id") ON UPDATE CASCADE
CONSTRAINT "fk_role" FOREIGN KEY("role_id") REFERENCES "ruolo"("id") ON UPDATE CASCADE
);
CREATE TABLE country (
	id INTEGER PRIMARY KEY NOT NULL,
	code VARCHAR(3),
	name VARCHAR(45)
);
CREATE TABLE IF NOT EXISTS "game_finished"("id" INTEGER PRIMARY KEY NOT NULL, "open" BIT, city VARCHAR(45), country VARCHAR(45), hall VARCHAR(45), time INTEGER, number INTEGER, cat VARCHAR(45), spects INTEGER, gatemoney INTEGER, return BIT, female BIT, ref1 VARCHAR(45), ref2 VARCHAR(45), scorekeeper VARCHAR(45), linesman1 VARCHAR(45), linesman2 VARCHAR(45), linesman3 VARCHAR(45), linesman4 VARCHAR(45), delegate VARCHAR(45), mvp INTEGER, remote_id INTEGER, ref1_country, ref2_country, hteam_ridotti BIT DEFAULT 0, vteam_ridotti BIT DEFAULT 0, phase VARCHAR(45), phase_id, tournament_code, is_hometeam_a, is_hometeam_a_tb, syj, scorekeeper_country, linesman1_country, linesman2_country, linesman3_country, linesman4_country, delegate_country, ourteam_id INTEGER, end_time INTEGER, ref1_city VARCHAR(45), ref2_city VARCHAR(45), scorekeeper_city VARCHAR(45), close BIT NOT NULL DEFAULT 0, ref1_code VARCHAR(45), ref2_code VARCHAR(45), supervisor VARCHAR(45), videochecker VARCHAR(45), scorekeeper2 VARCHAR(45), responsible VARCHAR(45), sup_code VARCHAR(45), del_code VARCHAR(45), sck_code VARCHAR(45), sck2_code VARCHAR(45), vck_code VARCHAR(45), res_code VARCHAR(45), m_code VARCHAR(45), m_omol VARCHAR(45), remarks VARCHAR(150), remarks2 VARCHAR(150), remarks3 VARCHAR(150), flags_sign VARCHAR(30), is_golden BIT NOT NULL DEFAULT 0, time_ref_arr INTEGER, time_docs_home INTEGER, time_docs_vis INTEGER, video_file VARCHAR(255), ball_model VARCHAR(30), defibrillator VARCHAR(45), addetto VARCHAR(45), def_code VARCHAR(45), verbal_yn BIT NOT NULL DEFAULT 0, verbal_ok BIT NOT NULL DEFAULT 0, verbal_note VARCHAR(45), remarks4 VARCHAR(150), remarks5 VARCHAR(150), allievo_h BIT NOT NULL DEFAULT 0, allievo_v BIT NOT NULL DEFAULT 0, remarks6 VARCHAR(150), ref3 VARCHAR(45), ref3_city VARCHAR(45), ref3_country TEXT, ref3_code VARCHAR(45), is2of3 BIT NOT NULL DEFAULT 0, sw_version VARCHAR(12), forfait INTEGER NOT NULL DEFAULT 0, niv INTEGER NOT NULL DEFAULT 0, sb_msg VARCHAR(500), upd_setpos INTEGER NOT NULL DEFAULT 0, is_missing INTEGER NOT NULL DEFAULT 0, scout_status INTEGER NOT NULL DEFAULT 0, `sign_cap` BLOB, `sign_first_coach` BLOB, `sign_second_coach` BLOB, `sign_cap_en` BLOB, `sign_first_coach_en` BLOB, `sign_second_coach_en` BLOB, `sign_ref1` BLOB, `sign_ref2` BLOB, `sign_scorekeeper` BLOB, `sign_scorekeeper2` BLOB, `sign_delegate` BLOB, `sign_dir` BLOB, `sign_dir_en` BLOB, remarks7 VARCHAR(150), start_time INTEGER, notplayed INTEGER NOT NULL DEFAULT 0, is_temp BIT NOT NULL DEFAULT 0, created_at INTEGER DEFAULT 0, analyst_id_threshold INTEGER NOT NULL DEFAULT 0, CONSTRAINT "fk_game" FOREIGN KEY("id") REFERENCES "game"("id") ON UPDATE CASCADE);
CREATE TABLE IF NOT EXISTS "stats"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"game_id" INTEGER NOT NULL, 
"sset_number" INTEGER, 
"team_id" INTEGER NOT NULL, 
"player_id" INTEGER NOT NULL, 
"homescore" INTEGER, 
"visitorscore" INTEGER, 
"point" INTEGER NOT NULL DEFAULT 0, 
"error" INTEGER NOT NULL DEFAULT 0 
);
CREATE TABLE IF NOT EXISTS "tactics"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"game_id" INTEGER NOT NULL, 
"curr_stats" INTEGER NOT NULL DEFAULT 0, 
"srv_zone0" INTEGER NOT NULL DEFAULT 0, 
"srv_pl_id0" INTEGER NOT NULL DEFAULT 0, 
"srv_forced0" INTEGER NOT NULL DEFAULT 0, 
"pass_far0" INTEGER NOT NULL DEFAULT 0, 
"set_incr0" INTEGER NOT NULL DEFAULT 0, 
"set_pl_id0" INTEGER NOT NULL DEFAULT 0, 
"att_dir0" INTEGER NOT NULL DEFAULT 0, 
"att_forced0" INTEGER NOT NULL DEFAULT 0, 
"srv_zone1" INTEGER NOT NULL DEFAULT 0, 
"srv_pl_id1" INTEGER NOT NULL DEFAULT 0, 
"srv_forced1" INTEGER NOT NULL DEFAULT 0, 
"pass_far1" INTEGER NOT NULL DEFAULT 0, 
"set_incr1" INTEGER NOT NULL DEFAULT 0, 
"set_pl_id1" INTEGER NOT NULL DEFAULT 0, 
"att_dir1" INTEGER NOT NULL DEFAULT 0, 
"att_forced1" INTEGER NOT NULL DEFAULT 0 
);
CREATE TABLE IF NOT EXISTS "sim_serve0020"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"player_id" INTEGER NOT NULL, 
"pp" INTEGER NOT NULL DEFAULT 0, 
"p" INTEGER NOT NULL DEFAULT 0, 
"e" INTEGER NOT NULL DEFAULT 0, 
"s" INTEGER NOT NULL DEFAULT 0, 
"m" INTEGER NOT NULL DEFAULT 0, 
"mm" INTEGER NOT NULL DEFAULT 0, 
"float" INTEGER NOT NULL DEFAULT 0, 
"sfloat" INTEGER NOT NULL DEFAULT 0, 
"salto" INTEGER NOT NULL DEFAULT 0, 
"zp1" INTEGER NOT NULL DEFAULT 0, 
"zp6" INTEGER NOT NULL DEFAULT 0, 
"zp5" INTEGER NOT NULL DEFAULT 0, 
"za1" INTEGER NOT NULL DEFAULT 0, 
"za6" INTEGER NOT NULL DEFAULT 0, 
"za5" INTEGER NOT NULL DEFAULT 0, 
"tot" INTEGER NOT NULL DEFAULT 0, 
"team_id" INTEGER NOT NULL 
);
CREATE TABLE IF NOT EXISTS "sim_serve2025"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"player_id" INTEGER NOT NULL, 
"pp" INTEGER NOT NULL DEFAULT 0, 
"p" INTEGER NOT NULL DEFAULT 0, 
"e" INTEGER NOT NULL DEFAULT 0, 
"s" INTEGER NOT NULL DEFAULT 0, 
"m" INTEGER NOT NULL DEFAULT 0, 
"mm" INTEGER NOT NULL DEFAULT 0, 
"float" INTEGER NOT NULL DEFAULT 0, 
"sfloat" INTEGER NOT NULL DEFAULT 0, 
"salto" INTEGER NOT NULL DEFAULT 0, 
"zp1" INTEGER NOT NULL DEFAULT 0, 
"zp6" INTEGER NOT NULL DEFAULT 0, 
"zp5" INTEGER NOT NULL DEFAULT 0, 
"za1" INTEGER NOT NULL DEFAULT 0, 
"za6" INTEGER NOT NULL DEFAULT 0, 
"za5" INTEGER NOT NULL DEFAULT 0, 
"tot" INTEGER NOT NULL DEFAULT 0, 
"team_id" INTEGER NOT NULL 
);
CREATE TABLE IF NOT EXISTS "users"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"username" VARCHAR(30), 
"hash" VARCHAR(128), 
"salt" INTEGER NOT NULL DEFAULT 0, 
"dbprefix" VARCHAR(30), 
"islast" BIT NOT NULL DEFAULT 0 
, server VARCHAR(100));
CREATE TABLE IF NOT EXISTS "notes"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"game_id" INTEGER NOT NULL, 
"sset_number" INTEGER, 
"homescore" INTEGER, 
"visitorscore" INTEGER, 
"note" VARCHAR(200) 
);
CREATE TABLE IF NOT EXISTS "sequential_events"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"game_id" INTEGER NOT NULL, 
"sset_id" INTEGER NOT NULL, 
"event_id" INTEGER NOT NULL, 
"prev_skill" INTEGER, 
"next_skill" INTEGER, 
"prev_mark" INTEGER, 
"next_mark" INTEGER 
, "prev2_skill" INTEGER, "prev2_mark" INTEGER, "next2_skill" INTEGER, "next2_mark" INTEGER, "prev2_event_id" INTEGER, "prev_event_id" INTEGER, "next_event_id" INTEGER, "next2_event_id" INTEGER);
CREATE TABLE IF NOT EXISTS "convocazioni0"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"game_id" INTEGER NOT NULL, 
"team_id" INTEGER NOT NULL, 
"player_id" INTEGER NOT NULL, 
"jersey" INTEGER NOT NULL, 
"role_id" INTEGER NOT NULL, 
"starting_pos" INTEGER NOT NULL, 
"starting_pos2" INTEGER NOT NULL, 
"starting_pos3" INTEGER NOT NULL, 
"starting_pos4" INTEGER NOT NULL, 
"starting_pos5" INTEGER NOT NULL, 
"starting_pos6" INTEGER NOT NULL, 
"starting_pos7" INTEGER NOT NULL, 
"starting_pos8" INTEGER NOT NULL, 
"starting_pos9" INTEGER NOT NULL, 
"captain" BIT DEFAULT 0, 
"under" BIT NOT NULL DEFAULT 0, 
"availability" INTEGER NOT NULL DEFAULT 0, 
CONSTRAINT "fk_game" FOREIGN KEY("game_id") REFERENCES "game"("id") ON UPDATE CASCADE
CONSTRAINT "fk_team" FOREIGN KEY("team_id") REFERENCES "team"("id") ON UPDATE CASCADE
CONSTRAINT "fk_player" FOREIGN KEY("player_id") REFERENCES "player"("id") ON UPDATE CASCADE
CONSTRAINT "fk_role" FOREIGN KEY("role_id") REFERENCES "ruolo"("id") ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "reminders"(
"id" INTEGER PRIMARY KEY NOT NULL, 
"game_id" INTEGER NOT NULL, 
"hs" INTEGER NOT NULL, 
"vs" INTEGER NOT NULL, 
"roth" INTEGER NOT NULL, 
"rotv" INTEGER NOT NULL, 
"active" BIT NOT NULL DEFAULT 0, 
"note" VARCHAR(200) 
);
CREATE TABLE IF NOT EXISTS "print_configs" (
"id" INTEGER,
"descr" TEXT UNIQUE,
"current" INTEGER DEFAULT 0,
PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "print_config_details" (
"id" INTEGER,
"config_id" INTEGER,
"tab_name" TEXT,
"filter_name" TEXT DEFAULT NULL,
"filter_value" INTEGER DEFAULT 0, "entry_index" INTEGER NOT NULL DEFAULT 0, "tab_order" INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "input_code_map"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS "input_code_map_entry"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  ace_code INTEGER NOT NULL,
  input_code TEXT NOT NULL,
  FOREIGN KEY (map_id) REFERENCES input_code_map(id)
);
CREATE TABLE IF NOT EXISTS "dvw_import_alias"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zlt_key TEXT NOT NULL,
  ace_id INTEGER NOT NULL,
  description TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS "dv_code_log"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  sset_id INTEGER DEFAULT 0,
  event_id INTEGER DEFAULT 0,
  sequence INTEGER NOT NULL,
  code_raw TEXT DEFAULT '',
  code_normalized TEXT NOT NULL DEFAULT '',
  code_type INTEGER NOT NULL DEFAULT 0,
  validation INTEGER NOT NULL DEFAULT 0,
  timestamp TEXT DEFAULT ''
, set_number INTEGER DEFAULT 0, setter_home INTEGER DEFAULT 0, setter_away INTEGER DEFAULT 0, rot_id INTEGER DEFAULT 0);
CREATE TABLE d_SET_base_custom (id INTEGER PRIMARY KEY NOT NULL, descr VARCHAR(45), long_descr VARCHAR(100));
CREATE TABLE bench_requests ( 
id INTEGER PRIMARY KEY AUTOINCREMENT, 
game_id INTEGER NOT NULL, 
team_id INTEGER NOT NULL, 
team_side TEXT NOT NULL, 
request_type TEXT NOT NULL, 
payload TEXT, 
status TEXT DEFAULT 'pending', 
created_at INTEGER NOT NULL, 
updated_at INTEGER, set_number INTEGER DEFAULT 0);
CREATE TABLE r_career ( 
  id INTEGER PRIMARY KEY NOT NULL, 
  player_id INTEGER, 
  team_id INTEGER, 
  team_name TEXT, 
  year INTEGER, 
  league_descr TEXT, 
  role_id INTEGER 
);
CREATE TABLE IF NOT EXISTS "videocheck_log"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  sset_id INTEGER DEFAULT 0,
  event_id INTEGER DEFAULT 0,
  set_number INTEGER DEFAULT 0,
  score_our INTEGER DEFAULT 0,
  score_their INTEGER DEFAULT 0,
  team_id INTEGER DEFAULT 0,
  team_name TEXT DEFAULT '',
  caller INTEGER DEFAULT 0,
  vc_type INTEGER DEFAULT 0,
  vc_outcome INTEGER DEFAULT 0,
  timestamp TEXT DEFAULT '',
  synced INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "special_rally"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  sset_id INTEGER DEFAULT 0,
  set_number INTEGER DEFAULT 0,
  score_home INTEGER DEFAULT 0,
  score_visitor INTEGER DEFAULT 0,
  rally_type INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  timestamp TEXT DEFAULT '',
  synced INTEGER DEFAULT 0
);
CREATE INDEX indice1 ON event(ip_fondamentale, ip_player, mark, sset);
CREATE INDEX convocazioni_idx_game_team ON convocazioni (game_id, team_id);
CREATE INDEX convocazioni0_idx_game_team ON convocazioni0 (game_id, team_id);
CREATE INDEX "gameOnset_index" ON sset (game);
CREATE INDEX "gamessetOnrotations_index" ON rotations (game_id,sset_id);
CREATE INDEX idx_event_team ON event(team);
CREATE INDEX idx_event_agg ON event(sset, IP_fondamentale, ATT_breakpoint, mark, IP_player);
CREATE INDEX idx_azione_start ON azione(start_event);
CREATE INDEX idx_azione_end ON azione(end_event);
CREATE INDEX idx_event_sset_fond_team ON event(sset, IP_fondamentale, team);
CREATE INDEX idx_event_sset_fond_pos ON event(sset, IP_fondamentale, pos_giocatore);
CREATE INDEX idx_player_team ON player(current_team);
CREATE INDEX idx_rotations_event ON rotations(event_id, forced);
CREATE INDEX idx_icme_map ON input_code_map_entry(map_id, entry_type);
CREATE UNIQUE INDEX idx_dia_key ON dvw_import_alias(zlt_key);
CREATE INDEX idx_dcl_game ON dv_code_log(game_id, sequence);
CREATE INDEX idx_dcl_event ON dv_code_log(event_id);
CREATE INDEX idx_event_att ON event(sset, IP_fondamentale, pos_giocatore, ATT_cono);
CREATE INDEX idx_vcl_game ON videocheck_log(game_id);
CREATE INDEX idx_vcl_event ON videocheck_log(event_id);
CREATE INDEX idx_sr_game ON special_rally(game_id);
CREATE TABLE IF NOT EXISTS "dvw_mapping_preset"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS "dvw_mapping_preset_entry"(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  dvw_code TEXT NOT NULL,
  ace_id INTEGER NOT NULL,
  FOREIGN KEY (preset_id) REFERENCES dvw_mapping_preset(id)
);
CREATE INDEX idx_dmpe_preset ON dvw_mapping_preset_entry(preset_id, entry_type);
INSERT INTO d_SERVE_type VALUES(1,'float');
INSERT INTO d_SERVE_type VALUES(2,'saltofloat');
INSERT INTO d_SERVE_type VALUES(3,'salto');
INSERT INTO d_SERVE_type VALUES(4,'ibrida');
INSERT INTO d_IP_fondamentale VALUES(1,'attacco');
INSERT INTO d_IP_fondamentale VALUES(2,'difesa');
INSERT INTO d_IP_fondamentale VALUES(3,'muro');
INSERT INTO d_IP_fondamentale VALUES(4,'ricezione');
INSERT INTO d_IP_fondamentale VALUES(5,'alzata');
INSERT INTO d_IP_fondamentale VALUES(6,'servizio');
INSERT INTO d_IP_fondamentale VALUES(7,'freeball');
INSERT INTO d_OP_othertype VALUES(1,'timeout');
INSERT INTO d_OP_othertype VALUES(2,'sostituzione');
INSERT INTO ruolo VALUES(1,'palleggiatore');
INSERT INTO ruolo VALUES(2,'schiacciatore');
INSERT INTO ruolo VALUES(3,'centrale');
INSERT INTO ruolo VALUES(4,'libero');
INSERT INTO ruolo VALUES(5,'opposto');
INSERT INTO d_ATT_base VALUES(1,'K1');
INSERT INTO d_ATT_base VALUES(2,'KU');
INSERT INTO d_ATT_base VALUES(3,'KC');
INSERT INTO d_ATT_base VALUES(4,'K2');
INSERT INTO d_ATT_base VALUES(5,'K7');
INSERT INTO d_ATT_base VALUES(6,'KZ');
INSERT INTO d_ATT_base VALUES(7,'KO');
INSERT INTO d_ATT_base VALUES(8,'KB');
INSERT INTO d_ATT_base VALUES(9,'KM');
INSERT INTO d_ATT_base VALUES(10,'KK');
INSERT INTO d_ATT_base VALUES(11,'KT');
INSERT INTO d_ATT_base VALUES(12,'KW');
INSERT INTO d_ATT_base VALUES(13,'KH');
INSERT INTO d_ATT_base VALUES(14,'KV');
INSERT INTO d_ATT_base VALUES(15,'KS');
INSERT INTO d_ATT_base VALUES(16,'KF');
INSERT INTO d_ATT_base VALUES(17,'KP');
INSERT INTO d_ATT_base VALUES(18,'KD');
INSERT INTO d_ATT_base VALUES(19,'KE');
INSERT INTO d_ATT_base VALUES(20,'KN');
INSERT INTO d_ATT_base VALUES(21,'K4');
INSERT INTO d_ERROR_type VALUES(0,'invalid');
INSERT INTO d_ERROR_type VALUES(1,'battuta');
INSERT INTO d_ERROR_type VALUES(2,'doppia');
INSERT INTO d_ERROR_type VALUES(3,'accompagnata');
INSERT INTO d_ERROR_type VALUES(4,'posizione');
INSERT INTO d_ERROR_type VALUES(5,'invasione');
INSERT INTO d_ERROR_type VALUES(6,'giallo');
INSERT INTO d_ERROR_type VALUES(7,'rosso');
INSERT INTO d_ERROR_type VALUES(8,'ricostruzione');
INSERT INTO d_ERROR_type VALUES(9,'proteste');
INSERT INTO d_ERROR_type VALUES(10,'infortunio');
INSERT INTO d_ERROR_type VALUES(11,'annotazioni');
INSERT INTO d_ERROR_type VALUES(12,'quattro tocchi');
INSERT INTO d_ERROR_type VALUES(13,'tetto');
INSERT INTO d_ERROR_type VALUES(14,'invasione di seconda linea');
INSERT INTO d_special_codes VALUES(1,'Diretta Terra');
INSERT INTO d_special_codes VALUES(2,'Muro terra');
INSERT INTO d_special_codes VALUES(3,'Rete terra');
INSERT INTO d_special_codes VALUES(4,'Mani fuori lato');
INSERT INTO d_special_codes VALUES(5,'Mani fuori lungo');
INSERT INTO d_special_codes VALUES(6,'Diretta Rete');
INSERT INTO d_special_codes VALUES(7,'Rete fuori');
INSERT INTO d_special_codes VALUES(8,'Fuori laterale');
INSERT INTO d_special_codes VALUES(9,'Fuori lungo');
INSERT INTO d_special_codes VALUES(10,'Chiamata arbitrale');
INSERT INTO d_special_codes VALUES(11,'Non giocabile');
INSERT INTO d_special_codes VALUES(12,'Trattenuta');
INSERT INTO d_special_codes VALUES(13,'Fallo di posizione');
INSERT INTO d_special_codes VALUES(14,'Chiamata arbitrale');
INSERT INTO d_special_codes VALUES(15,'Fuori lunga');
INSERT INTO d_special_codes VALUES(16,'Fuori sinistra');
INSERT INTO d_special_codes VALUES(17,'Fuori destra');
INSERT INTO d_special_codes VALUES(18,'Rete');
INSERT INTO d_special_codes VALUES(19,'Chiamata arbitrale');
INSERT INTO d_special_codes VALUES(20,'Mani fuori di lato');
INSERT INTO d_special_codes VALUES(21,'Mani fuori lungo');
INSERT INTO d_special_codes VALUES(22,'Toccata a muro e poi a terra');
INSERT INTO d_special_codes VALUES(23,'Palla tra le mani');
INSERT INTO d_special_codes VALUES(24,'No salto');
INSERT INTO d_special_codes VALUES(25,'Mano-rete');
INSERT INTO d_special_codes VALUES(26,'Invasione');
INSERT INTO d_special_codes VALUES(27,'Chiamata arbitrale');
INSERT INTO d_special_codes VALUES(28,'Non giocabile');
INSERT INTO d_special_codes VALUES(29,'Trattenuta');
INSERT INTO d_special_codes VALUES(30,'Fallo di posizione');
INSERT INTO d_special_codes VALUES(31,'Chiamata arbitrale');
INSERT INTO d_special_codes VALUES(32,'Non giocabile');
INSERT INTO d_special_codes VALUES(33,'Trattenuta');
INSERT INTO d_special_codes VALUES(34,'Fallo di posizione');
INSERT INTO d_special_codes VALUES(35,'Chiamata arbitrale');
INSERT INTO d_special_codes VALUES(36,'Inattaccabile');
INSERT INTO d_special_codes VALUES(37,'Toccala rete');
INSERT INTO d_special_codes VALUES(38,'Chiamata arbitrale');
INSERT INTO d_pos_wrt_body VALUES(1,'Centrale');
INSERT INTO d_pos_wrt_body VALUES(2,'Destra');
INSERT INTO d_pos_wrt_body VALUES(3,'Sinistra');
INSERT INTO d_pos_wrt_body VALUES(4,'Alta');
INSERT INTO d_pos_wrt_body VALUES(5,'Bassa');
INSERT INTO d_ATT_type VALUES(1,'Forte');
INSERT INTO d_ATT_type VALUES(2,'Piazzata');
INSERT INTO d_ATT_type VALUES(3,'Pallonetto');
INSERT INTO d_DIG_type VALUES(1,'Su attacco');
INSERT INTO d_DIG_type VALUES(2,'Su copertura');
INSERT INTO d_DIG_type VALUES(3,'Dopo tocco del muro');
INSERT INTO d_DIG_type VALUES(4,'Di emergenza');
INSERT INTO d_BLOCK_type VALUES(1,'Assistenza');
INSERT INTO d_BLOCK_type VALUES(2,'Tentativo');
INSERT INTO d_SET_type VALUES(1,'Alta');
INSERT INTO d_SET_type VALUES(2,'Mezza');
INSERT INTO d_SET_type VALUES(3,'Super');
INSERT INTO d_SET_type VALUES(4,'Tesa');
INSERT INTO d_SET_type VALUES(5,'Veloce');
INSERT INTO d_SET_type VALUES(6,'Fast');
INSERT INTO d_SET_type VALUES(7,'Altre');
INSERT INTO d_SET_type VALUES(8,'Bagher');
INSERT INTO d_SET_chiamata VALUES(1,'A4',NULL,'F',4912);
INSERT INTO d_SET_chiamata VALUES(2,'A5',NULL,'F',4114);
INSERT INTO d_SET_chiamata VALUES(3,'A2',NULL,'B',4988);
INSERT INTO d_SET_chiamata VALUES(4,'A1',NULL,'B',4186);
INSERT INTO d_SET_chiamata VALUES(5,'A6',NULL,'P',4150);
INSERT INTO d_SET_chiamata VALUES(6,'A8',NULL,'P',4137);
INSERT INTO d_SET_chiamata VALUES(7,'A9',NULL,'P',4163);
INSERT INTO d_SET_chiamata VALUES(8,'M2',NULL,'B',4950);
INSERT INTO d_SET_chiamata VALUES(9,'M4',NULL,'F',4950);
INSERT INTO d_SET_chiamata VALUES(10,'M8',NULL,'B',4976);
INSERT INTO d_SET_chiamata VALUES(11,'M3',NULL,'B',4976);
INSERT INTO d_SET_chiamata VALUES(12,'M7',NULL,'F',4924);
INSERT INTO d_SET_chiamata VALUES(13,'M5',NULL,'P',4138);
INSERT INTO d_SET_chiamata VALUES(14,'M6',NULL,'P',4150);
INSERT INTO d_SET_chiamata VALUES(15,'M1',NULL,'P',4163);
INSERT INTO d_SET_chiamata VALUES(16,'S4',NULL,'F',4912);
INSERT INTO d_SET_chiamata VALUES(17,'S5',NULL,'F',4114);
INSERT INTO d_SET_chiamata VALUES(18,'S2',NULL,'B',4988);
INSERT INTO d_SET_chiamata VALUES(19,'S1',NULL,'B',4186);
INSERT INTO d_SET_chiamata VALUES(20,'T4',NULL,'F',4912);
INSERT INTO d_SET_chiamata VALUES(21,'T5',NULL,'F',4114);
INSERT INTO d_SET_chiamata VALUES(22,'T2',NULL,'B',4988);
INSERT INTO d_SET_chiamata VALUES(23,'T1',NULL,'B',4186);
INSERT INTO d_SET_chiamata VALUES(24,'V7',NULL,'C',4932);
INSERT INTO d_SET_chiamata VALUES(25,'VC',NULL,'C',4941);
INSERT INTO d_SET_chiamata VALUES(26,'V5',NULL,'C',4946);
INSERT INTO d_SET_chiamata VALUES(27,'V4',NULL,'C',4947);
INSERT INTO d_SET_chiamata VALUES(28,'V6',NULL,'C',4150);
INSERT INTO d_SET_chiamata VALUES(29,'V8',NULL,'C',4949);
INSERT INTO d_SET_chiamata VALUES(30,'V1',NULL,'C',4956);
INSERT INTO d_SET_chiamata VALUES(31,'V2',NULL,'C',4868);
INSERT INTO d_SET_chiamata VALUES(32,'V3',NULL,'C',4981);
INSERT INTO d_SET_chiamata VALUES(33,'F2',NULL,'B',4976);
INSERT INTO d_SET_chiamata VALUES(34,'F1',NULL,'C',4976);
INSERT INTO d_SET_chiamata VALUES(35,'F3',NULL,'C',4986);
INSERT INTO d_SET_chiamata VALUES(36,'F4',NULL,'C',4970);
INSERT INTO d_SET_chiamata VALUES(37,'OR',NULL,'-',4949);
INSERT INTO d_SET_chiamata VALUES(38,'OP',NULL,'S',4964);
INSERT INTO d_SET_chiamata VALUES(39,'O2',NULL,'-',4949);
INSERT INTO d_SET_chiamata VALUES(40,'O3',NULL,'-',4950);
INSERT INTO d_SET_chiamata VALUES(41,'T3',NULL,'C',4949);
INSERT INTO d_SET_chiamata VALUES(42,'A3',NULL,'C',4950);
INSERT INTO d_SET_chiamata VALUES(43,'S3',NULL,'C',4949);
INSERT INTO d_SET_chiamata VALUES(44,'F5',NULL,'F',4114);
INSERT INTO d_SET_chiamata VALUES(45,'S6',NULL,'P',4150);
INSERT INTO d_SET_chiamata VALUES(46,'T6',NULL,'P',4150);
INSERT INTO d_SET_chiamata VALUES(47,'F6',NULL,'P',4150);
INSERT INTO d_SERVE_distance VALUES(1,'Lontano');
INSERT INTO d_SERVE_distance VALUES(2,'Medio');
INSERT INTO d_SERVE_distance VALUES(3,'Vicino');
INSERT INTO staff_role VALUES(0,'invalid');
INSERT INTO staff_role VALUES(1,'first_coach');
INSERT INTO staff_role VALUES(2,'second_coach');
INSERT INTO staff_role VALUES(3,'first_scout');
INSERT INTO staff_role VALUES(4,'second_scout');
INSERT INTO staff_role VALUES(5,'manager');
INSERT INTO staff_role VALUES(6,'physiotherapist');
INSERT INTO staff_role VALUES(7,'doctor');
INSERT INTO staff_role VALUES(8,'team_code');
INSERT INTO staff_role VALUES(9,'team_bg_color');
INSERT INTO staff_role VALUES(10,'team_fg_color');
INSERT INTO staff_role VALUES(11,'setter_bg_color');
INSERT INTO staff_role VALUES(12,'setter_fg_color');
INSERT INTO staff_role VALUES(13,'libero_bg_color');
INSERT INTO staff_role VALUES(14,'libero_fg_color');
INSERT INTO staff_role VALUES(15,'team_fivb_code');
INSERT INTO staff_role VALUES(16,'addetto');
INSERT INTO staff_role VALUES(20,'third_coach');
INSERT INTO staff_role VALUES(30,'allievo');
INSERT INTO staff_role VALUES(31,'ass_referee');
INSERT INTO player_stuff_types VALUES(0,'invalid');
INSERT INTO player_stuff_types VALUES(1,'height');
INSERT INTO player_stuff_types VALUES(2,'weight');
INSERT INTO player_stuff_types VALUES(3,'captain');
INSERT INTO player_stuff_types VALUES(4,'jump1');
INSERT INTO player_stuff_types VALUES(5,'jump2');
INSERT INTO player_stuff_types VALUES(6,'code');
INSERT INTO player_stuff_types VALUES(7,'fivb_code');
INSERT INTO player_stuff_types VALUES(8,'nick');
INSERT INTO player_stuff_types VALUES(9,'city');
INSERT INTO player_stuff_types VALUES(10,'other_team');
INSERT INTO country VALUES(0,'000','Default');
INSERT INTO country VALUES(1,'ABW','Aruba');
INSERT INTO country VALUES(2,'AFG','Afghanistan');
INSERT INTO country VALUES(3,'AGO','Angola');
INSERT INTO country VALUES(4,'AIA','Anguilla');
INSERT INTO country VALUES(5,'ALA','Åland Islands');
INSERT INTO country VALUES(6,'ALB','Albania');
INSERT INTO country VALUES(7,'AND','Andorra');
INSERT INTO country VALUES(8,'ARE','United Arab Emirates');
INSERT INTO country VALUES(9,'ARG','Argentina');
INSERT INTO country VALUES(10,'ARM','Armenia');
INSERT INTO country VALUES(11,'ASM','American Samoa');
INSERT INTO country VALUES(12,'ATA','Antarctica');
INSERT INTO country VALUES(13,'ATF','French Southern Territories');
INSERT INTO country VALUES(14,'ATG','Antigua and Barbuda');
INSERT INTO country VALUES(15,'AUS','Australia');
INSERT INTO country VALUES(16,'AUT','Austria');
INSERT INTO country VALUES(17,'AZE','Azerbaijan');
INSERT INTO country VALUES(18,'BDI','Burundi');
INSERT INTO country VALUES(19,'BEL','Belgium');
INSERT INTO country VALUES(20,'BEN','Benin');
INSERT INTO country VALUES(21,'BES','Bonaire, Sint Eustatius and Saba');
INSERT INTO country VALUES(22,'BFA','Burkina Faso');
INSERT INTO country VALUES(23,'BGD','Bangladesh');
INSERT INTO country VALUES(24,'BGR','Bulgaria');
INSERT INTO country VALUES(25,'BHR','Bahrain');
INSERT INTO country VALUES(26,'BHS','Bahamas');
INSERT INTO country VALUES(27,'BIH','Bosnia and Herzegovina');
INSERT INTO country VALUES(28,'BLM','Saint Barthélemy');
INSERT INTO country VALUES(29,'BLR','Belarus');
INSERT INTO country VALUES(30,'BLZ','Belize');
INSERT INTO country VALUES(31,'BMU','Bermuda');
INSERT INTO country VALUES(32,'BOL','Bolivia, Plurinational State of');
INSERT INTO country VALUES(33,'BRA','Brazil');
INSERT INTO country VALUES(34,'BRB','Barbados');
INSERT INTO country VALUES(35,'BRN','Brunei Darussalam');
INSERT INTO country VALUES(36,'BTN','Bhutan');
INSERT INTO country VALUES(37,'BVT','Bouvet Island');
INSERT INTO country VALUES(38,'BWA','Botswana');
INSERT INTO country VALUES(39,'CAF','Central African Republic');
INSERT INTO country VALUES(40,'CAN','Canada');
INSERT INTO country VALUES(41,'CCK','Cocos (Keeling) Islands');
INSERT INTO country VALUES(42,'CHE','Switzerland');
INSERT INTO country VALUES(43,'CHL','Chile');
INSERT INTO country VALUES(44,'CHN','China');
INSERT INTO country VALUES(45,'CIV','Côte d''''Ivoire');
INSERT INTO country VALUES(46,'CMR','Cameroon');
INSERT INTO country VALUES(47,'COD','Congo, the Democratic Republic of the');
INSERT INTO country VALUES(48,'COG','Congo');
INSERT INTO country VALUES(49,'COK','Cook Islands');
INSERT INTO country VALUES(50,'COL','Colombia');
INSERT INTO country VALUES(51,'COM','Comoros');
INSERT INTO country VALUES(52,'CPV','Cape Verde');
INSERT INTO country VALUES(53,'CRI','Costa Rica');
INSERT INTO country VALUES(54,'CUB','Cuba');
INSERT INTO country VALUES(55,'CUW','Curaçao');
INSERT INTO country VALUES(56,'CXR','Christmas Island');
INSERT INTO country VALUES(57,'CYM','Cayman Islands');
INSERT INTO country VALUES(58,'CYP','Cyprus');
INSERT INTO country VALUES(59,'CZE','Czech Republic');
INSERT INTO country VALUES(60,'DEU','Germany');
INSERT INTO country VALUES(61,'DJI','Djibouti');
INSERT INTO country VALUES(62,'DMA','Dominica');
INSERT INTO country VALUES(63,'DNK','Denmark');
INSERT INTO country VALUES(64,'DOM','Dominican Republic');
INSERT INTO country VALUES(65,'DZA','Algeria');
INSERT INTO country VALUES(66,'ECU','Ecuador');
INSERT INTO country VALUES(67,'EGY','Egypt');
INSERT INTO country VALUES(68,'ERI','Eritrea');
INSERT INTO country VALUES(69,'ESH','Western Sahara');
INSERT INTO country VALUES(70,'ESP','Spain');
INSERT INTO country VALUES(71,'EST','Estonia');
INSERT INTO country VALUES(72,'ETH','Ethiopia');
INSERT INTO country VALUES(73,'FIN','Finland');
INSERT INTO country VALUES(74,'FJI','Fiji');
INSERT INTO country VALUES(75,'FLK','Falkland Islands (Malvinas)');
INSERT INTO country VALUES(76,'FRA','France');
INSERT INTO country VALUES(77,'FRO','Faroe Islands');
INSERT INTO country VALUES(78,'FSM','Micronesia, Federated States of');
INSERT INTO country VALUES(79,'GAB','Gabon');
INSERT INTO country VALUES(80,'GBR','United Kingdom');
INSERT INTO country VALUES(81,'GEO','Georgia');
INSERT INTO country VALUES(82,'GGY','Guernsey');
INSERT INTO country VALUES(83,'GHA','Ghana');
INSERT INTO country VALUES(84,'GIB','Gibraltar');
INSERT INTO country VALUES(85,'GIN','Guinea');
INSERT INTO country VALUES(86,'GLP','Guadeloupe');
INSERT INTO country VALUES(87,'GMB','Gambia');
INSERT INTO country VALUES(88,'GNB','Guinea-Bissau');
INSERT INTO country VALUES(89,'GNQ','Equatorial Guinea');
INSERT INTO country VALUES(90,'GRC','Greece');
INSERT INTO country VALUES(91,'GRD','Grenada');
INSERT INTO country VALUES(92,'GRL','Greenland');
INSERT INTO country VALUES(93,'GTM','Guatemala');
INSERT INTO country VALUES(94,'GUF','French Guiana');
INSERT INTO country VALUES(95,'GUM','Guam');
INSERT INTO country VALUES(96,'GUY','Guyana');
INSERT INTO country VALUES(97,'HKG','Hong Kong');
INSERT INTO country VALUES(98,'HMD','Heard Island and McDonald Islands');
INSERT INTO country VALUES(99,'HND','Honduras');
INSERT INTO country VALUES(100,'HRV','Croatia');
INSERT INTO country VALUES(101,'HTI','Haiti');
INSERT INTO country VALUES(102,'HUN','Hungary');
INSERT INTO country VALUES(103,'IDN','Indonesia');
INSERT INTO country VALUES(104,'IMN','Isle of Man');
INSERT INTO country VALUES(105,'IND','India');
INSERT INTO country VALUES(106,'IOT','British Indian Ocean Territory');
INSERT INTO country VALUES(107,'IRL','Ireland');
INSERT INTO country VALUES(108,'IRN','Iran, Islamic Republic of');
INSERT INTO country VALUES(109,'IRQ','Iraq');
INSERT INTO country VALUES(110,'ISL','Iceland');
INSERT INTO country VALUES(111,'ISR','Israel');
INSERT INTO country VALUES(112,'ITA','Italy');
INSERT INTO country VALUES(113,'JAM','Jamaica');
INSERT INTO country VALUES(114,'JEY','Jersey');
INSERT INTO country VALUES(115,'JOR','Jordan');
INSERT INTO country VALUES(116,'JPN','Japan');
INSERT INTO country VALUES(117,'KAZ','Kazakhstan');
INSERT INTO country VALUES(118,'KEN','Kenya');
INSERT INTO country VALUES(119,'KGZ','Kyrgyzstan');
INSERT INTO country VALUES(120,'KHM','Cambodia');
INSERT INTO country VALUES(121,'KIR','Kiribati');
INSERT INTO country VALUES(122,'KNA','Saint Kitts and Nevis');
INSERT INTO country VALUES(123,'KOR','Korea, Republic of');
INSERT INTO country VALUES(124,'KWT','Kuwait');
INSERT INTO country VALUES(125,'LAO','Lao People''''s Democratic Republic');
INSERT INTO country VALUES(126,'LBN','Lebanon');
INSERT INTO country VALUES(127,'LBR','Liberia');
INSERT INTO country VALUES(128,'LBY','Libya');
INSERT INTO country VALUES(129,'LCA','Saint Lucia');
INSERT INTO country VALUES(130,'LIE','Liechtenstein');
INSERT INTO country VALUES(131,'LKA','Sri Lanka');
INSERT INTO country VALUES(132,'LSO','Lesotho');
INSERT INTO country VALUES(133,'LTU','Lithuania');
INSERT INTO country VALUES(134,'LUX','Luxembourg');
INSERT INTO country VALUES(135,'LVA','Latvia');
INSERT INTO country VALUES(136,'MAC','Macao');
INSERT INTO country VALUES(137,'MAF','Saint Martin (French part)');
INSERT INTO country VALUES(138,'MAR','Morocco');
INSERT INTO country VALUES(139,'MCO','Monaco');
INSERT INTO country VALUES(140,'MDA','Moldova, Republic of');
INSERT INTO country VALUES(141,'MDG','Madagascar');
INSERT INTO country VALUES(142,'MDV','Maldives');
INSERT INTO country VALUES(143,'MEX','Mexico');
INSERT INTO country VALUES(144,'MHL','Marshall Islands');
INSERT INTO country VALUES(145,'MKD','Macedonia, the former Yugoslav Republic of');
INSERT INTO country VALUES(146,'MLI','Mali');
INSERT INTO country VALUES(147,'MLT','Malta');
INSERT INTO country VALUES(148,'MMR','Myanmar');
INSERT INTO country VALUES(149,'MNE','Montenegro');
INSERT INTO country VALUES(150,'MNG','Mongolia');
INSERT INTO country VALUES(151,'MNP','Northern Mariana Islands');
INSERT INTO country VALUES(152,'MOZ','Mozambique');
INSERT INTO country VALUES(153,'MRT','Mauritania');
INSERT INTO country VALUES(154,'MSR','Montserrat');
INSERT INTO country VALUES(155,'MTQ','Martinique');
INSERT INTO country VALUES(156,'MUS','Mauritius');
INSERT INTO country VALUES(157,'MWI','Malawi');
INSERT INTO country VALUES(158,'MYS','Malaysia');
INSERT INTO country VALUES(159,'MYT','Mayotte');
INSERT INTO country VALUES(160,'NAM','Namibia');
INSERT INTO country VALUES(161,'NCL','New Caledonia');
INSERT INTO country VALUES(162,'NER','Niger');
INSERT INTO country VALUES(163,'NFK','Norfolk Island');
INSERT INTO country VALUES(164,'NGA','Nigeria');
INSERT INTO country VALUES(165,'NIC','Nicaragua');
INSERT INTO country VALUES(166,'NIU','Niue');
INSERT INTO country VALUES(167,'NLD','Netherlands');
INSERT INTO country VALUES(168,'NOR','Norway');
INSERT INTO country VALUES(169,'NPL','Nepal');
INSERT INTO country VALUES(170,'NRU','Nauru');
INSERT INTO country VALUES(171,'NZL','New Zealand');
INSERT INTO country VALUES(172,'OMN','Oman');
INSERT INTO country VALUES(173,'PAK','Pakistan');
INSERT INTO country VALUES(174,'PAN','Panama');
INSERT INTO country VALUES(175,'PCN','Pitcairn');
INSERT INTO country VALUES(176,'PER','Peru');
INSERT INTO country VALUES(177,'PHL','Philippines');
INSERT INTO country VALUES(178,'PLW','Palau');
INSERT INTO country VALUES(179,'PNG','Papua New Guinea');
INSERT INTO country VALUES(180,'POL','Poland');
INSERT INTO country VALUES(181,'PRI','Puerto Rico');
INSERT INTO country VALUES(182,'PRK','Korea, Democratic People''''s Republic of');
INSERT INTO country VALUES(183,'PRT','Portugal');
INSERT INTO country VALUES(184,'PRY','Paraguay');
INSERT INTO country VALUES(185,'PSE','Palestine, State of');
INSERT INTO country VALUES(186,'PYF','French Polynesia');
INSERT INTO country VALUES(187,'QAT','Qatar');
INSERT INTO country VALUES(188,'REU','Réunion');
INSERT INTO country VALUES(189,'ROU','Romania');
INSERT INTO country VALUES(190,'RUS','Russian Federation');
INSERT INTO country VALUES(191,'RWA','Rwanda');
INSERT INTO country VALUES(192,'SAU','Saudi Arabia');
INSERT INTO country VALUES(193,'SDN','Sudan');
INSERT INTO country VALUES(194,'SEN','Senegal');
INSERT INTO country VALUES(195,'SGP','Singapore');
INSERT INTO country VALUES(196,'SGS','South Georgia and the South Sandwich Islands');
INSERT INTO country VALUES(197,'SHN','Saint Helena, Ascension and Tristan da Cunha');
INSERT INTO country VALUES(198,'SJM','Svalbard and Jan Mayen');
INSERT INTO country VALUES(199,'SLB','Solomon Islands');
INSERT INTO country VALUES(200,'SLE','Sierra Leone');
INSERT INTO country VALUES(201,'SLV','El Salvador');
INSERT INTO country VALUES(202,'SMR','San Marino');
INSERT INTO country VALUES(203,'SOM','Somalia');
INSERT INTO country VALUES(204,'SPM','Saint Pierre and Miquelon');
INSERT INTO country VALUES(205,'SRB','Serbia');
INSERT INTO country VALUES(206,'SSD','South Sudan');
INSERT INTO country VALUES(207,'STP','Sao Tome and Principe');
INSERT INTO country VALUES(208,'SUR','Suriname');
INSERT INTO country VALUES(209,'SVK','Slovakia');
INSERT INTO country VALUES(210,'SVN','Slovenia');
INSERT INTO country VALUES(211,'SWE','Sweden');
INSERT INTO country VALUES(212,'SWZ','Swaziland');
INSERT INTO country VALUES(213,'SXM','Sint Maarten (Dutch part)');
INSERT INTO country VALUES(214,'SYC','Seychelles');
INSERT INTO country VALUES(215,'SYR','Syrian Arab Republic');
INSERT INTO country VALUES(216,'TCA','Turks and Caicos Islands');
INSERT INTO country VALUES(217,'TCD','Chad');
INSERT INTO country VALUES(218,'TGO','Togo');
INSERT INTO country VALUES(219,'THA','Thailand');
INSERT INTO country VALUES(220,'TJK','Tajikistan');
INSERT INTO country VALUES(221,'TKL','Tokelau');
INSERT INTO country VALUES(222,'TKM','Turkmenistan');
INSERT INTO country VALUES(223,'TLS','Timor-Leste');
INSERT INTO country VALUES(224,'TON','Tonga');
INSERT INTO country VALUES(225,'TTO','Trinidad and Tobago');
INSERT INTO country VALUES(226,'TUN','Tunisia');
INSERT INTO country VALUES(227,'TUR','Turkey');
INSERT INTO country VALUES(228,'TUV','Tuvalu');
INSERT INTO country VALUES(229,'TWN','Taiwan, Province of China');
INSERT INTO country VALUES(230,'TZA','Tanzania, United Republic of');
INSERT INTO country VALUES(231,'UGA','Uganda');
INSERT INTO country VALUES(232,'UKR','Ukraine');
INSERT INTO country VALUES(233,'UMI','United States Minor Outlying Islands');
INSERT INTO country VALUES(234,'URY','Uruguay');
INSERT INTO country VALUES(235,'USA','United States');
INSERT INTO country VALUES(236,'UZB','Uzbekistan');
INSERT INTO country VALUES(237,'VAT','Holy See (Vatican City State)');
INSERT INTO country VALUES(238,'VCT','Saint Vincent and the Grenadines');
INSERT INTO country VALUES(239,'VEN','Venezuela, Bolivarian Republic of');
INSERT INTO country VALUES(240,'VGB','Virgin Islands, British');
INSERT INTO country VALUES(241,'VIR','Virgin Islands, U.S.');
INSERT INTO country VALUES(242,'VNM','Viet Nam');
INSERT INTO country VALUES(243,'VUT','Vanuatu');
INSERT INTO country VALUES(244,'WLF','Wallis and Futuna');
INSERT INTO country VALUES(245,'WSM','Samoa');
INSERT INTO country VALUES(246,'YEM','Yemen');
INSERT INTO country VALUES(247,'ZAF','South Africa');
INSERT INTO country VALUES(248,'ZMB','Zambia');
INSERT INTO country VALUES(249,'ZWE','Zimbabwe');
INSERT INTO country VALUES(250,'FOR','Foreign');
INSERT INTO country VALUES(251,'SCT','Scotland');
INSERT INTO country VALUES(252,'WLS','Wales');
INSERT INTO country VALUES(253,'ENG','England');
INSERT INTO country VALUES(254,'NIR','Northern Ireland');
INSERT INTO country VALUES(255,'CAT','Catalonia');
INSERT INTO country VALUES(256,'EUS','Basque Country');
INSERT INTO country VALUES(257,'GAL','Galicia');
INSERT INTO country VALUES(258,'XKX','Kosovo');
INSERT INTO country VALUES(259,'BQA','Bonaire');
INSERT INTO country VALUES(260,'SAB','Saba');
INSERT INTO country VALUES(261,'SEU','Sint Eustatius');
INSERT INTO input_code_map VALUES(1,'Default',1,'2026-04-21 13:33:14');
INSERT INTO input_code_map_entry VALUES(1,1,'combination',1,'V5');
INSERT INTO input_code_map_entry VALUES(2,1,'combination',2,'V0');
INSERT INTO input_code_map_entry VALUES(3,1,'combination',3,'V6');
INSERT INTO input_code_map_entry VALUES(4,1,'combination',4,'V8');
INSERT INTO input_code_map_entry VALUES(5,1,'combination',5,'VP');
INSERT INTO input_code_map_entry VALUES(6,1,'combination',6,'VR');
INSERT INTO input_code_map_entry VALUES(7,1,'combination',7,'VB');
INSERT INTO input_code_map_entry VALUES(8,1,'combination',8,'X3');
INSERT INTO input_code_map_entry VALUES(9,1,'combination',9,'XT');
INSERT INTO input_code_map_entry VALUES(10,1,'combination',10,'X4');
INSERT INTO input_code_map_entry VALUES(11,1,'combination',11,'XQ');
INSERT INTO input_code_map_entry VALUES(12,1,'combination',12,'X9');
INSERT INTO input_code_map_entry VALUES(13,1,'combination',13,'XR');
INSERT INTO input_code_map_entry VALUES(14,1,'combination',14,'XP');
INSERT INTO input_code_map_entry VALUES(15,1,'combination',15,'XB');
INSERT INTO input_code_map_entry VALUES(16,1,'combination',16,'C5');
INSERT INTO input_code_map_entry VALUES(17,1,'combination',17,'C0');
INSERT INTO input_code_map_entry VALUES(18,1,'combination',18,'C6');
INSERT INTO input_code_map_entry VALUES(19,1,'combination',19,'C8');
INSERT INTO input_code_map_entry VALUES(20,1,'combination',20,'X5');
INSERT INTO input_code_map_entry VALUES(21,1,'combination',21,'X0');
INSERT INTO input_code_map_entry VALUES(22,1,'combination',22,'X6');
INSERT INTO input_code_map_entry VALUES(23,1,'combination',23,'X8');
INSERT INTO input_code_map_entry VALUES(24,1,'combination',24,'X7');
INSERT INTO input_code_map_entry VALUES(25,1,'combination',25,'XD');
INSERT INTO input_code_map_entry VALUES(26,1,'combination',26,'XG');
INSERT INTO input_code_map_entry VALUES(27,1,'combination',27,'XC');
INSERT INTO input_code_map_entry VALUES(28,1,'combination',28,'XL');
INSERT INTO input_code_map_entry VALUES(29,1,'combination',29,'XM');
INSERT INTO input_code_map_entry VALUES(30,1,'combination',30,'X1');
INSERT INTO input_code_map_entry VALUES(31,1,'combination',31,'X2');
INSERT INTO input_code_map_entry VALUES(32,1,'combination',32,'XS');
INSERT INTO input_code_map_entry VALUES(33,1,'combination',33,'XF');
INSERT INTO input_code_map_entry VALUES(34,1,'combination',34,'CB');
INSERT INTO input_code_map_entry VALUES(35,1,'combination',35,'CF');
INSERT INTO input_code_map_entry VALUES(36,1,'combination',36,'CD');
INSERT INTO input_code_map_entry VALUES(37,1,'combination',37,'PR');
INSERT INTO input_code_map_entry VALUES(38,1,'combination',38,'PP');
INSERT INTO input_code_map_entry VALUES(39,1,'combination',39,'P2');
INSERT INTO input_code_map_entry VALUES(40,1,'combination',40,'V3');
INSERT INTO input_code_map_entry VALUES(41,1,'combination',41,'Z3');
INSERT INTO input_code_map_entry VALUES(42,1,'combination',42,'ZA');
INSERT INTO input_code_map_entry VALUES(43,1,'combination',43,'ZB');
INSERT INTO input_code_map_entry VALUES(44,1,'combination',44,'ZC');
INSERT INTO input_code_map_entry VALUES(45,1,'combination',45,'ZD');
INSERT INTO input_code_map_entry VALUES(46,1,'combination',46,'ZE');
INSERT INTO input_code_map_entry VALUES(47,1,'combination',47,'ZF');
INSERT INTO input_code_map_entry VALUES(48,1,'base',1,'K1');
INSERT INTO input_code_map_entry VALUES(49,1,'base',2,'KU');
INSERT INTO input_code_map_entry VALUES(50,1,'base',3,'KC');
INSERT INTO input_code_map_entry VALUES(51,1,'base',4,'K2');
INSERT INTO input_code_map_entry VALUES(52,1,'base',5,'K7');
INSERT INTO input_code_map_entry VALUES(53,1,'base',6,'KZ');
INSERT INTO input_code_map_entry VALUES(54,1,'base',7,'KO');
INSERT INTO input_code_map_entry VALUES(55,1,'base',8,'KB');
INSERT INTO input_code_map_entry VALUES(56,1,'base',9,'KM');
INSERT INTO input_code_map_entry VALUES(57,1,'base',10,'KK');
INSERT INTO input_code_map_entry VALUES(58,1,'base',11,'KT');
INSERT INTO input_code_map_entry VALUES(59,1,'base',12,'KW');
INSERT INTO input_code_map_entry VALUES(60,1,'base',13,'KH');
INSERT INTO input_code_map_entry VALUES(61,1,'base',14,'KV');
INSERT INTO input_code_map_entry VALUES(62,1,'base',15,'KS');
INSERT INTO input_code_map_entry VALUES(63,1,'base',16,'KF');
INSERT INTO input_code_map_entry VALUES(64,1,'base',17,'KP');
INSERT INTO input_code_map_entry VALUES(65,1,'base',18,'KD');
INSERT INTO input_code_map_entry VALUES(66,1,'base',19,'KE');
INSERT INTO input_code_map_entry VALUES(67,1,'base',20,'KN');
INSERT INTO input_code_map_entry VALUES(68,1,'base',21,'K4');
INSERT INTO dvw_import_alias VALUES(1,'2CH',3,'A2');
INSERT INTO dvw_import_alias VALUES(2,'2LH',3,'A2');
INSERT INTO dvw_import_alias VALUES(3,'2LM',11,'M3');
INSERT INTO dvw_import_alias VALUES(4,'2LN',33,'F2');
INSERT INTO dvw_import_alias VALUES(5,'1LN',34,'F1');
INSERT INTO dvw_import_alias VALUES(6,'2LT',22,'T2');
INSERT INTO dvw_import_alias VALUES(7,'2LU',18,'S2');
INSERT INTO dvw_import_alias VALUES(8,'3CM',10,'M8');
INSERT INTO dvw_import_alias VALUES(9,'3CO',40,'O3');
INSERT INTO dvw_import_alias VALUES(10,'3CQ',29,'V8');
INSERT INTO dvw_import_alias VALUES(11,'3LM',8,'M2');
INSERT INTO dvw_import_alias VALUES(12,'3LO',38,'OP');
INSERT INTO dvw_import_alias VALUES(13,'3LQ',31,'V2');
INSERT INTO dvw_import_alias VALUES(14,'3RM',9,'M4');
INSERT INTO dvw_import_alias VALUES(15,'3RQ',30,'V1');
INSERT INTO dvw_import_alias VALUES(16,'4CH',1,'A4');
INSERT INTO dvw_import_alias VALUES(17,'3LN',35,'F3');
INSERT INTO dvw_import_alias VALUES(18,'4RH',1,'A4');
INSERT INTO dvw_import_alias VALUES(19,'4RM',12,'M7');
INSERT INTO dvw_import_alias VALUES(20,'4RQ',24,'V7');
INSERT INTO dvw_import_alias VALUES(21,'4RT',20,'T4');
INSERT INTO dvw_import_alias VALUES(22,'4RU',16,'S4');
INSERT INTO dvw_import_alias VALUES(23,'7CH',2,'A5');
INSERT INTO dvw_import_alias VALUES(24,'7CM',13,'M5');
INSERT INTO dvw_import_alias VALUES(25,'7CT',21,'T5');
INSERT INTO dvw_import_alias VALUES(26,'7CU',17,'T5');
INSERT INTO dvw_import_alias VALUES(27,'8CM',14,'M6');
INSERT INTO dvw_import_alias VALUES(28,'8CH',14,'M6');
INSERT INTO dvw_import_alias VALUES(29,'9CH',4,'A1');
INSERT INTO dvw_import_alias VALUES(30,'9CT',23,'T1');
INSERT INTO dvw_import_alias VALUES(31,'9CU',19,'S1');
INSERT INTO dvw_import_alias VALUES(32,'9LM',4,'A1');
INSERT INTO dvw_import_alias VALUES(33,'3CH',42,'A3');
INSERT INTO dvw_import_alias VALUES(34,'3CT',41,'T3');
INSERT INTO dvw_import_alias VALUES(35,'3CU',43,'S3');
INSERT INTO dvw_import_alias VALUES(36,'5CN',44,'F5');
INSERT INTO dvw_import_alias VALUES(37,'6CN',47,'F6');
INSERT INTO dvw_import_alias VALUES(38,'8CT',46,'T6');
INSERT INTO dvw_import_alias VALUES(39,'8CU',45,'S6');
INSERT INTO manifestazione VALUES(0,'');
INSERT INTO manifestazione VALUES(1,'campionato');
INSERT INTO manifestazione VALUES(2,'coppa');
INSERT INTO manifestazione VALUES(3,'amichevole');
INSERT INTO manifestazione VALUES(4,'playoff');
