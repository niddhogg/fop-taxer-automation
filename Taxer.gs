/**
 * @OnlyCurrentDoc
 */

//
function taxerAddIncome(user, dateFormatted, accountId, total, comment) {  
  // get user id
  var id = CacheService.getUserCache().get('taxer_auth_id_' + user);
  
  // params...
  var params_json = {};
  params_json["userId"] = parseInt(id);
  
  params_json["operation"] = {};
  params_json["operation"]["type"] = "FlowIncome";
  params_json["operation"]["comment"] = comment;
  params_json["operation"]["timestamp"] = dateFormatted;
  params_json["operation"]["financeType"] = "custom";
  params_json["operation"]["total"] = parseInt(total);
  
  params_json["operation"]["account"] = {};
  params_json["operation"]["account"]["currency"] = "USD";
  params_json["operation"]["account"]["id"] = accountId;
  
  // url
  var url = "https://taxer.ua/api/finances/operation/create";
  var response = doTaxerRequest(url, params_json, user);
  
  // return response
  return response;
  
}

//
function taxerAddExchange(user, dateFormatted, outgoAccountId, incomeAccountId, outgoTotal, income_currency, comment) {  
  // get user id
  var id = CacheService.getUserCache().get('taxer_auth_id_' + user);
  
  // params...
  var params_json = {};
  params_json["userId"] = parseInt(id);
  
  params_json["operation"] = {};
  params_json["operation"]["type"] = "CurrencyExchange";
  params_json["operation"]["comment"] = comment;
  params_json["operation"]["timestamp"] = dateFormatted;
  params_json["operation"]["financeType"] = "custom";
  params_json["operation"]["outgoTotal"] = parseInt(outgoTotal);
  params_json["operation"]["incomeCurrency"] = income_currency;
  
  params_json["operation"]["outgoAccount"] = {};
  params_json["operation"]["outgoAccount"]["currency"] = "USD";
  params_json["operation"]["outgoAccount"]["id"] = outgoAccountId;
  
  params_json["operation"]["incomeAccount"] = {};
  params_json["operation"]["incomeAccount"]["currency"] = "UAH";
  params_json["operation"]["incomeAccount"]["id"] = incomeAccountId;

  // url
  var url = "https://taxer.ua/api/finances/operation/create";
  var response = doTaxerRequest(url, params_json, user);

  // return response
  return response;
  
}

//
function taxer_auth(user, password) {
  // login params
  var params_json = {};
  params_json["email"] = user;
  params_json["password"] = password;
  
  // form up options
  var header = { "Origin": "https://taxer.ua", 
                "Accept": "*/*",
                "Content-Type": "application/json"
               };
  
  var options = {"headers":header,
                 "method" : "POST", 
                 "payload" : JSON.stringify(params_json), 
                 "muteHttpExceptions": true };
  
  // url
  var url = "https://taxer.ua/api/user/login/login?lang=uk";
  
  // get reponse from tasks and amounts
  var response = UrlFetchApp.fetch(url, options);
  
  if (200 != response.getResponseCode())
  {
    // error on login...
    throw new Error("Не вдалось зайти на акаунт taxer");
  }
  
  
  // read cookies
  var cookie_headers = response.getAllHeaders()['Set-Cookie'];
  
  var cookie_headers_str = String(cookie_headers);
  var cookies_split = cookie_headers_str.split(",");
  
  var keys = ["session_hash", "session_key_hash", "session_key", "PHPSESSID", "XSRF-TOKEN"];
  var cookies = "";
  
  cookies_split.forEach(function(entry) {
    var cookies_split2 = entry.split(";");
    
    cookies_split2.forEach(function(entry2) {
      var cookies_split3 = entry2.split("=");
      
      var key = cookies_split3[0];
      var value = cookies_split3[1];
      
      if (keys.indexOf(key) != -1) {
        cookies = cookies + key + "=" + value + "; ";
      }
      
    });
    
  });
  
  // read id
  var json = JSON.parse(response);
  var id = String(json["account"]["users"][0]["id"]);
 
  // add to cache
  CacheService.getUserCache().put('taxer_auth_' + user, cookies, 21600 ); // 6h
  CacheService.getUserCache().put('taxer_auth_id_' + user, id, 21600 ); // 6h
  
}


// my log
function log(msg) {
  Logger.log(msg);
}

// having the template, returns object  with data
function getDataFromString(msg, template, replaceDots) {
  // fix it a little
  msg = " " + msg + " ";
  template = " " + template + " ";
  
  // replace symbols...
  if (replaceDots) {
    msg = msg.replace(/\./g,"%");
    template = template.replace(/\./g,"%")
  }
  
  //
  var regexp_vars = /\$(.*?)\$/g;
  
  var vars = [];
  while(matched = regexp_vars.exec(template)) {
    for (i = 1; i < matched.length; i++) {
      vars.push(matched[i]);
    }
  };
  
  var pattern = template;
  for (i = 0; i < vars.length; i++) {
    pattern = pattern.replace("\$" + vars[i] + "\$", "(.*?)");
  }
  
  var data = {};
  
  var regex = new RegExp(pattern);
  matched = regex.exec(msg);
  for (i = 1; i < matched.length; i++) {
    data[vars[i-1]] = matched[i];
  }
  
  return data;
}


// get existing operations inputted in taxer
// used to avoid duplicate entries
function taxerGetOperations(user) {
  var operations = new Array();
  taxerGetOperationsPagination(user, 1, operations);
  
  return operations;
}

// get operation, read all pages
function taxerGetOperationsPagination(user, page, operations) {
  // get user id
  var id = CacheService.getUserCache().get('taxer_auth_id_' + user);
  
  // params...
  var params_json = {};
  params_json["userId"] = parseInt(id);
  params_json["pageNumber"] = page;
  params_json["filters"] = [];
  
  var url = "https://taxer.ua/api/finances/operation/load?lang=uk"
  var response = doTaxerRequest(url, params_json, user);
  
  // result object
  var obj = JSON.parse(response);
  
  // add operations to array
  var ops = obj.operations;
  
  for (let op_num in ops) {
    var operation = ops[op_num];
    
    // get data
    var type = operation["type"];
    
    var content = {};
    if (type == "CurrencyExchange") {
      // 1 for uah amount
      // 0 for usd amount..
      content = operation["contents"][1];
    } else {
      content = operation["contents"][0];
    }
      
    var currency = content["accountCurrency"];
    var amount = content["sumCurrency"];
    var timestamp = content["timestamp"];
    
    // create operation
    var new_operation = {};
    
    if (type == "CurrencyExchange") {
      new_operation.type = "exchange";
    } else {
      new_operation.type = "income";
    }
    
    new_operation.currency = currency;
    new_operation.amount = amount;
    new_operation.timestamp = timestamp;
    
    // convert timestamp...
    var date = new Date(timestamp * 1000);
    
    var year = date.getFullYear();
    var month = date.getMonth();
    var day = date.getDate();
    
    new_operation.year = year;
    new_operation.month = month;
    new_operation.day = day;
    
    new_operation.enabled = true;
    
    // add to array
    operations.push(new_operation);
    
  }
  
  // move on with next pages if any
  var total_pages = obj.paginator.totalPages;
  if (page < total_pages) {
    var new_page = page + 1;
    taxerGetOperationsPagination(user, new_page, operations);
  }
  
  
}

// generic taxer request function
function doTaxerRequest(url, params_json, user) {
  // form up options
  var header = {'Cookie': CacheService.getUserCache().get('taxer_auth_' + user),
                "Content-Type": "application/x-www-form-urlencoded"};
  
  var options = {"headers":header,
                 "method" : "POST", 
                 "payload" : JSON.stringify(params_json),
                 "muteHttpExceptions": true };
  
  // get reponse
  var response = UrlFetchApp.fetch(url, options);
  
  // return
  return response;
}

// creates finance account for user
function taxerCreateFinanceAccount(currency, user) {
  // get user id
  var id = CacheService.getUserCache().get('taxer_auth_id_' + user);
  
  // params...
  var params_json = {};
  params_json["account"] = {};
  params_json["account"]["currency"] = currency;
  params_json["account"]["title"] = "FOP " + currency;
  params_json["account"]["bank"] = "Automatic";
  params_json["userId"] = parseInt(id);
  
  // make request
  var url = "https://taxer.ua/api/finances/account/create?lang=uk";
  var response = doTaxerRequest(url, params_json, user);
  
  var obj = JSON.parse(response);
  return obj.id;
  
}


// main function
function taxerImportData() {
  // ui
  var ui = SpreadsheetApp.getUi();
  
  // read data
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dest = ss.getSheetByName("Setup");
  
  var user = dest.getRange("C5").getValue();
  var password = dest.getRange("C6").getValue();
  var bank = dest.getRange("C7").getValue();
  
  // todo: output good errors inside google sheet
  taxer_auth(user, password);
  
  // get user id
  var id = CacheService.getUserCache().get('taxer_auth_id_' + user);
  
  // params...
  var params_json = {};
  params_json["userId"] = parseInt(id);
  params_json["pageNumber"] = 1;
  params_json["filters"] = {};
  
  // load accounts
  var url = "https://taxer.ua/api/finances/account/load?lang=u";
  var response = doTaxerRequest(url, params_json, user);
  
  var obj = JSON.parse(response);
  //log(JSON.stringify(obj.accounts, null, "\t"))
  
  
  
  // okay now we need to know accounts number
  var uah_account = -1;
  var usd_account = -1;
  
  var max_uah = -1;
  var max_usd = -1;
  
  var accounts = obj.accounts;
  
  for (let account_num in accounts) {
    var account = accounts[account_num];
    
    var id = account.id;
    var currency = account.currency;
    var balance = account.balance; // used to detect best account for operation, so it succeeds
    
    if (id != 1) {
      // first one is autogenerated, we ignore it
      if (currency == "UAH") {
        if (balance > max_uah) {
          uah_account = id;
          max_uah = balance;
          continue;
        }
      } else if (currency == "USD") {
        if (balance > max_usd) {
          usd_account = id;
          max_usd = balance;
          continue;
        }
      }
    }
  }
  
  // if accounts not found we will automatically create them for user
  if (uah_account == -1) {
    // create uah account
    uah_account = taxerCreateFinanceAccount("UAH", user);
  }
  
  if (usd_account == -1) {
    // create uah account
    usd_account = taxerCreateFinanceAccount("USD", user);
  }
  
  // ################################################################################
  // let's get banking info
  var dest = ss.getSheetByName("Bank");
  var range = dest.getDataRange();
  var values = range.getValues();
  var last_row = dest.getLastRow();
  
  var col_currency = -1;
  var col_date = -1;
  var col_amount = -1;
  var col_comment = -1;
  var exchange_pattern = "";
  var date_pattern = "";
  
  for (var i = 1 ; i < last_row; i++){
    var raw = values[i];

    var bank_name = raw[0];
    if (bank_name == bank) {
      col_currency = raw[2];
      col_date = raw[3];
      col_amount = raw[4];
      col_comment = raw[5];
      exchange_pattern = raw[6];
      date_pattern = raw[7];
      
      break;
    }
  }
  
  if (col_currency < 0) {
    // not defined bank
    ui.alert("Помилка","Не знайдена інформація (лист Bank) для банку " + bank, ui.ButtonSet.OK);
    return;
  
  }
  
  // check exchange pattern for needed elements
  if (exchange_pattern.indexOf("$usd$") == -1) {
    ui.alert("Помилка","Поточний exchange_pattern не містить елемент $usd$", ui.ButtonSet.OK);
    return;
  }
  
  if (exchange_pattern.indexOf("$exchange_date$") == -1) {
    ui.alert("Помилка","Поточний exchange_pattern не містить елемент $exchange_date$", ui.ButtonSet.OK);
    return;
  }
  
  // check date pattern for needed elements
  if (date_pattern.indexOf("$day$") == -1) {
    ui.alert("Помилка","Поточний date_pattern не містить елемент $day$", ui.ButtonSet.OK);
    return;
  }
  
  if (date_pattern.indexOf("$month$") == -1) {
    ui.alert("Помилка","Поточний date_pattern не містить елемент $month$", ui.ButtonSet.OK);
    return;
  }
  
  if (date_pattern.indexOf("$year$") == -1) {
    ui.alert("Помилка","Поточний date_pattern не містить елемент $year$", ui.ButtonSet.OK);
    return;
  }
  
  // ################################################################################
  // now is the time to read operations from imported excel ...
  var dest = ss.getSheetByName("Import");
  if (dest == null) {
    ui.alert("Помилка","Не знайдений лист для імпорту Import.", ui.ButtonSet.OK);
    return;
  }
  
  var range = dest.getDataRange();
  var values = range.getValues();
  var last_row = dest.getLastRow();
  
  // check if there's data..
  var test_val = dest.getRange("A1").getValue();
  if (test_val == "") {
    ui.alert("Помилка","Треба імпортувати CSV файл в лист під назвою Import. Для детальної інформації відкрийте, будь ласка, лист Guide.", ui.ButtonSet.OK);
    return;
  }
  
  
  //
  var import_ops = new Array();
  
  for (var i = 1 ; i < last_row; i++) {
    var raw = values[i];
    
    var currency = raw[col_currency];
    var date = raw[col_date];
    var amount = raw[col_amount];
    var comment = raw[col_comment];
    
    if (currency != "") {
      // new operation
      var new_op = {};
      new_op.currency = currency;
      new_op.comment = comment;
      
      // we care only for money added
      if (amount == "") {
        continue;
      }
      
      // remove all spaces
      if (typeof amount === "string"){
        amount = amount.replace(/ /g,"");
        amount = amount.replace(",",".");
      }
      
      // parse amount
      amount = parseFloat(amount);
      if (Number.isNaN(amount)) {
        // some error
        ui.alert("Помилка","Не вдалось отримати дані транзакції. Перевірте, що банк вказаний вірно. Якщо ви додавали банк власноруч, можливо значення колонок помилкове.", ui.ButtonSet.OK);
        return;
      }
      
      if (amount <= 0) {
        continue;
      }
      
      new_op.amount = amount;
      
      // filter
      if (currency == "USD") {
        // only for invoiced amounts
        // because it may be return of money
        // or transfer between your own usd accounts
        var comment_lower = comment.toLowerCase();
        var found = false;
        
        if (comment_lower.indexOf("invoice") != -1) {
          found = true;
        }
        
        if (comment_lower.indexOf("инвойс") != -1) {
          found = true;
        }
        
        if (comment_lower.indexOf("інвойс") != -1) {
          found = true;
        }
        
        if (!found) {
          continue;
        }
        
        new_op.type = "income";
      } else {
        // exchange operation now
        var data = {};
        try {
          data = getDataFromString(comment, exchange_pattern);
        } catch (error) {
          ui.alert("Помилка","Не вдалось отримати дані обміну валюти. Перевірте, що банк вказаний вірно. Якщо ви додавали банк власноруч, можливо значення exchange_pattern помилкове.", ui.ButtonSet.OK);
          return;
        }
        
        var usd = data.usd;
        var exchange_rate = data.exchange_rate;
        
        if (usd == null) {
          continue;
        }
        
        // get exchange rate
        var exchange_rate = Number(data.exchange_rate);
        if (Number.isNaN(exchange_rate)) {
          // some error...
          ui.alert("Помилка","Не вдалось отримати дані обміну валюти. Перевірте, що банк вказаний вірно. Якщо ви додавали банк власноруч, можливо значення exchange_pattern помилкове.", ui.ButtonSet.OK);
          return;
        }
        
        // exchange rate may be like 2832.0 for ukrsib
        if (exchange_rate > 1000) {
          exchange_rate = exchange_rate / 100;
        }
        
        new_op.type = "exchange";
        new_op.exchange_rate = exchange_rate;
        new_op.usd = usd;
        
      }
      
      // process date
      try {
        var data = getDataFromString(date, date_pattern, true);
        
        var year = parseInt(data.year,10);
        var month = parseInt(data.month,10) - 1;
        var day = parseInt(data.day,10);
        
        new_op.year = year;
        new_op.month = month;
        new_op.day = day;
        new_op.enabled = true;
        
        // timestamp date
        var full_date = new Date(year, month, day, 15, 0, 0);
        var timestamp = Math.floor((full_date.getTime() / 1000));
        
        new_op.timestamp = timestamp;
        
      } catch (error) {
        ui.alert("Помилка","Не вдалось отримати дані дати операції. Перевірте, що банк вказаний вірно. Якщо ви додавали банк власноруч, можливо значення date_pattern помилкове.", ui.ButtonSet.OK);
        return;
      }
      
      // add to array
      import_ops.push(new_op);
    }
    
  }
  
  //log(import_ops);
  
  // ################################################################################
  
  // get current inputted operations in taxer
  var operations = taxerGetOperations(user);
  
  // okay now we need to get rid of transactions that are already present in taxer
  for (var i = 0; i < import_ops.length; i++) {
    // get info
    var import_op = import_ops[i];
    if (import_op.enabled) {
      // now for each taxer transaction...
      for (var j = 0; j < operations.length; j++) {
        var taxer_op = operations[j];
        if (taxer_op.enabled) {
        
          // compare operations...
          var same = true;
          
          if (import_op.day != taxer_op.day) { same = false; }
          if (import_op.month != taxer_op.month) { same = false; }
          if (import_op.year != taxer_op.year) { same = false; }
          if (import_op.amount != taxer_op.amount) { same = false; }
          
          //
          if (same) {
            taxer_op.enabled = false;
            import_op.enabled = false;
          }
          
          //
        }
        
      }
    }
  }
  
  // okay now we have enabled and disabled transactions...
  log("outputting import ops");
  var transactions_to_add = 0;
  
  for (var i = 0; i < import_ops.length; i++) {
    var import_op = import_ops[i];
    if (import_op.enabled) {
      log(import_op);
      transactions_to_add++;
    }
  }
  
  // add to taxer
  for (var i = 0; i < import_ops.length; i++) {
    // get info
    var import_op = import_ops[i];
    if (import_op.enabled) {
      // import...
      if (import_op.type == "income") {
        var response = taxerAddIncome(user, import_op.timestamp, usd_account, import_op.amount, import_op.comment);
        if (200 == response.getResponseCode()) {
          // added
          log("added income op");
          
        } else {
          var response_text = response.getContentText().replace(
                  /\\u([0-9a-f]{4})/g, 
                  function (whole, group1) {return String.fromCharCode(parseInt(group1, 16));}
          );
          ui.alert("Помилка","Не вдалось додати транзакцію, помилка " + response_text + ". Транзакція: " + import_op.comment, ui.ButtonSet.OK);
          return;
          
        }
      } else {
        //
        var response = taxerAddExchange(user, import_op.timestamp, usd_account, uah_account, import_op.usd, -25, import_op.comment);
        if (200 == response.getResponseCode()) {
          // added
          log("added exchange op");
          
        } else {
          // error
          var response_text = response.getContentText().replace(
                  /\\u([0-9a-f]{4})/g, 
                  function (whole, group1) {return String.fromCharCode(parseInt(group1, 16));}
          );
          ui.alert("Помилка","Не вдалось додати транзакцію, помилка " + response_text + ". Транзакція: " + import_op.comment, ui.ButtonSet.OK);
          return;
          
        }
      }
      
      //
      
    }
  }
  
  // clear import...
  var dest = ss.getSheetByName("Import");
  var range = dest.getDataRange();
  range.clearContent();
  
  // show result
  if (transactions_to_add > 0) {
    ui.alert("Taxer","Всі операції успішно імпортовано", ui.ButtonSet.OK);

  } else {
    ui.alert("Taxer","Транкзації вже були синхронізовані, жодної операції не було додано", ui.ButtonSet.OK);
  }
  
  
}








