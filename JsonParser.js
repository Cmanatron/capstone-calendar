var http = require('http');
var fs = require('fs');
const url = require('url');
const path = require('path');

//const config =require ('config.json')
const settings = JSON.parse(fs.readFileSync('config.json'))


const csvDir = fs.readdirSync(path.join(__dirname,'/CSV'));
//console.log(csvDir);
let initCatalogue = [];
csvDir.forEach(file=>{
    //console.log('file: ' + file);
    let ext = file.split('.')[1]
   //console.log(ext);
    if(ext === 'csv'){
        initCatalogue.push(...fs.readFileSync(path.join(__dirname+'/CSV',file),'utf-8').split("\n")); 
    }
});
//console.log(initCatalogue);

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname,"config.json"),'utf-8')); //Settings define the CSV files to process and what port the server listens on.

async function googleDrive(){
    const target = settings.LINK
    const response = await fetch(target)
    if(!response.ok){
        console.log('there is a problem')
    }
    //console.log('I started the function')
    console.log(response)
    console.log('I got the data')
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync('TestFile.csv', buffer);
    }


function sanatize(array){
    var working = [];
    var multi = false; //Whether or not we need to put many values into one cell.
    var currentStore = 0;

   for(let index = 0; index < array.length; index++){
        if(array[index].split("")[0] == '"'){
            multi = !multi; //Starts Multiple Data entry if quote starts entry.
        }
        if(multi == false){
            if(array[index] == ''){
                working.push(null); //Empty cell. Will be Null for type checkign.
            }else{
            working.push(array[index]); //Adds data to cell.
            }
            currentStore++; 

        }else{
            if(working[currentStore]!=null){ 
            working[currentStore] = working[currentStore].concat(',' +array[index]);
            if(array[index].includes('"')){
                multi = !multi; //Ends Multiple Data Entry if quote ends entry.
                currentStore++; //Continues to next cell.
            }
            }else{
                working[currentStore] = array[index]; //Starts adding data to empty cell.
            }
        }

        if(currentStore ==14){ //Hardcoded end value. Easier than manually sanitizing data. Number represents the number of collumns.
            break;
        }

    };
    return working; 
}

function toJSON(array){ //Normalized Json array. Hardcoded values. Will be easier to search through. 
    let keys = array[0].split(',');
    //console.log('Keys: ' + keys)
    array.splice(0,1);
    jsonArray =[]
    array.forEach(entry=>{
        //console.log(entry);
        entry = sanatize(entry.split(','))
        var obj = {}
    if(entry[0]!= null){
    for(let i =0; i < entry.length; i++){
        if(keys[i] == 'DUE'){
            var dateParse = new Date(entry[i] + ' 2026')
            entry[i] = dateParse.toISOString();
        }
        obj[keys[i]] = entry[i];
    }
    jsonArray.push(obj);
}
});
    return jsonArray;
}


var DELIMITER = ','; //Basic CSV delimeter in case we need to switch.
var results = []; 

catalogue = toJSON(initCatalogue); //Normalizes JSON. I want all this done server side on startup to not mess with performance.
//console.log(catalogue);
console.log('Json processed');

try{
    fs.writeFileSync('Calendar.json',JSON.stringify(catalogue),null,2);
}
catch(err){
    console.log(err);
}

function updateCalendar(){
    
    const events = JSON.parse(fs.readFileSync("Calendar.json",'utf-8'));
    //events = JSON.parse(events);
    //console.log(events)
    var eventArray = []
    
    for(let i = 0; i<events.length; i++){
        eventArray.push({title: events[i].title, start: events[i].DUE, url: events[i].form, description: events[i].notes,category: events[i].jurisdiction});
    }
    //console.log(eventArray)
    return eventArray
    
    }



fs.writeFile("Events.json",JSON.stringify(updateCalendar()),'utf8', (err) =>{
    if(err){
        console.log(err);
    }
});

googleDrive()
//Server setup. Will listen to Google Sheets and serve Data.json