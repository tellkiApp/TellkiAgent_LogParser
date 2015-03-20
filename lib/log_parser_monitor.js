/**
* This script was developed by Guberni and is part of Tellki's Monitoring Solution
*
* February, 2015
* 
* Version 1.0
* 
* DEPENDENCIES:
*		line-by-line v0.1.3 (https://www.npmjs.com/package/line-by-line) ,
*		js-md5 v0.1.2 (https://www.npmjs.com/package/js-md5) ,
*
* DESCRIPTION: Monitor Log Parser utilization
*
* SYNTAX: node log_parser_monitor.js <LOGFILE_DIRECTORY> <LOGFILE_NAME> <LOGFILE_READ_POSITION> <LOGFILE_TIMESTAMP> <LOGFILE_PATTERN>
* 
* EXAMPLE: node "log_parser_monitor.js" "C:\\Guberni\\Tellki\\working\\logfile" "log.txt" "0" "-1" "TEMP"
*
* README:
*		<LOGFILE_DIRECTORY> logs directory path
*		
*		<LOGFILE_NAME> log file name. Can be a regular expression
*		
*		<LOGFILE_READ_POSITION> log file start read position
*		
*		<LOGFILE_TIMESTAMP> log file modification date
*		
*		<LOGFILE_PATTERN> text to find in log. Can be a regular expression.
**/

var fs = require("fs");
var LineByLineReader = require('line-by-line');
var md5 = require('js-md5');


// METRICS IDS
var metricId = "220:Log/Event Match Text:5";

var tempDir = "/tmp";

var outArray = [];


// ############# INPUT ###################################

//START
(function() {
	try
	{
		monitorInput(process.argv.slice(2));
	}
	catch(err)
	{	
		if(err instanceof InvalidParametersNumberError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof InvalidDateError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof FileError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof CreateTmpDirError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof WriteOnTmpFileError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else
		{
			console.log(err.message);
			process.exit(1);
		}
	}
}).call(this)


/*
* Verify number of passed arguments into the script.
*/
function monitorInput(args)
{
	
	if(args.length == 5)
	{
		monitorInputProcess(args);
	}
	else
	{
		throw new InvalidParametersNumberError()
	}
}

/*
* Process the passed arguments and send them to monitor execution (monitorLogParser)
* Receive: arguments to be processed
*/
function monitorInputProcess(args)
{
	
	//<LOGFILE_DIRECTORY> 
	var directory = args[0];
	
	//<LOGFILE_NAME> 
	var filename = args[1];
	
	//<LOGFILE_READ_POSITION> 
	var position = parseInt(args[2]);
	
	//<LOGFILE_TIMESTAMP> 
	var dateTime = args[3];
	
	var timestamp = -1;
	
	if (dateTime !== "-1")
	{
		timestamp = new Date(dateTime).getTime();
		
		if(isNaN(timestamp))
		{
			throw new InvalidDateError()
		}
	}
	
	//<LOGFILE_PATTERN>
	var patterns = args[4].replace(/\\\\,/g, ",");
	
	var patterns = patterns.split(",");
	
	//create match position object
	//containing start position and log file timestamp
	var matchPosition = new Object()
	matchPosition.line = position
	matchPosition.timestamp = timestamp
	
	
	//create object request with configuration to execute 
	var requests = []
	
	var request = new Object()
	request.directory = directory;
	request.filename = filename;
	request.position = position;
	request.dateTime = dateTime;
	request.patterns = patterns;
	request.matchPosition = matchPosition;
	
	
	requests.push(request)
	
	//call monitor
	monitorLogParser(requests);
	
}



// ################# Log Checker ###########################

/*
* Tests executer
* Receive: Test's list
*/
function monitorLogParser(requests) 
{
	
	for(var i in requests)
	{
		var request = requests[i];
		
		// Create MatchPatterns.
		var matchPatterns = createMatchPatterns(request.patterns);
		
		var directory = request.directory;
		var filenamePrefix = request.filename;
		
		// Parse filename prefix.
		filenamePrefix = filenamePrefix.replace(/\*/g, "(.*)");
		filenamePrefix = "^"+filenamePrefix+"$"
		
		
		var pattern = new RegExp(filenamePrefix);
		
		// Get all matching files by directory.
		var directoryFilenames = listFiles(directory);
		
		var matchFiles = [];

		for (var i in directoryFilenames)
		{
			var directoryFilename = directoryFilenames[i];
		
			var arrMatches = directoryFilename.match(pattern);
			
			if(arrMatches !== null)
			{
				var filePath = directory + "/" + directoryFilename;
				
				var stat = fs.statSync(filePath);
				var lastModifiedFile = new Date(stat.mtime).getTime();
				
				var matchFile = new Object()
				matchFile.filename = directoryFilename;
				matchFile.filePath = filePath;
				matchFile.fileDate = lastModifiedFile;
				
				matchFiles.push(matchFile);
			}
		}
		
		if (matchFiles.length === 0)
		{
			var ex = new FileError();
			ex.message = "Path doesn't exist.";
			throw ex;
		}

		
		processFile(request, matchFiles, matchPatterns, 0);
		
	}
}



/*
* Process log files to find the patterns
* Receive:
* - request object containing configurations
* - list of log files path to process
* - list of patterns to find
* - list of log files index
*/
function processFile(request, matchFiles, matchPatterns, index)
{
	var currentLinePosition = 0;
	var line = 0;
	var finalCurrentPosition = 0;
	var matchLines = [];
	
	var matchFile = matchFiles[index];
	
	var saveFile = true;
	
	var lr = new LineByLineReader(matchFile.filePath);

	lr.on('error', function (err) {
		// 'err' contains error object
		errorHandler(err);
	});

	lr.on('line', function (l) {
		// 'line' contains the current line without the trailing newline character.
		for (var j in matchPatterns)
		{
			var matchPattern = matchPatterns[j];
		
			if (matchPattern.found)
			{
				continue; // Skip matched patterns.
			}

			var matchPosition = createMatchPosition(request, matchFile.filePath, matchPattern);

			
			if (matchPosition.timestamp === 0 || ( matchFile.fileDate >= matchPosition.timestamp))
			{
				saveFile = true;

				if (currentLinePosition >= matchPosition.line)
				{
					var arrMatches = l.match(matchPattern.re);
					
					if(arrMatches !== null && !matchPattern.found)
					{
						// Match found.
						matchPattern.found = true;
						matchPattern.line = currentLinePosition+1;
						matchLines.push(l);
						
						finalCurrentPosition = currentLinePosition + 1;
						
						var info = new Object()
						info.filename = matchFile.filename;
						info.re = matchPattern.re;
						info.order = matchPattern.order;
						info.matchLine = finalCurrentPosition;
						info.matchLines = matchLines;
						
						outArray.push(info)
						
						matchLines = [];
							
					}
				}
			}
			else
			{
				saveFile = false;
				lr.close();
			}
		
		}
		
		currentLinePosition++;
	});

	
	lr.on('end', function () {

		
		index = index + 1;
		
		var allFound = true;
		
		for(var i in matchPatterns)
		{	
			if(!matchPatterns[i].found)
			{
				allFound = false;
				
				if(saveFile)
				{
					saveLineToDisk(currentLinePosition + 1, 0, matchFile.filePath, matchPatterns[i].re);
				}
			}
			else
			{
				if(saveFile)
				{
					saveLineToDisk(matchPatterns[i].line, 0, matchFile.filePath, matchPatterns[i].re);
				}
			}
		}
		
		if(!allFound && index < matchFiles.length)
		{	
			processFile(request, matchFiles, matchPatterns, index);
		}
		else
		{
			output();
			outArray = [];
		}
		
	});
}




//################### OUTPUT METRICS ###########################
/*
* Send metrics to console
*/
function output()
{
	for(var j in outArray)
	{
		for(var i in outArray[j].matchLines)
		{
			var out = "";
			var matchingLine = outArray[j].matchLines[i];
			
			out += metricId;
			out += "|";
			out += outArray[j].order+":";
			out += matchingLine.replace(/\|/g, "\\u007c");
			out += "|";
			out += outArray[j].filename;
			out += "|";
			
			console.log(out);
		}
	}
	
}


//################### ERROR HANDLER #########################
/*
* Used to handle errors of async functions
* Receive: Error/Exception
*/
function errorHandler(err)
{
	if(err instanceof CreateTmpDirError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof WriteOnTmpFileError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else
	{
		console.log(err.message);
		process.exit(1);
	}
}




// ##################### UTILS #####################

/*
* Create the match patterns to be applied on log files
* Receive: patterns list
* Return: pattern object list containing the regular expression to be applied 
*/
function createMatchPatterns(patterns)
{
	// Handle multiple patterns.
	var matchPatterns = [];

	
	for (var i in patterns)
	{
		var finalPattern = patterns[i];
		
		//clean pattern
		finalPattern = finalPattern.replace(/\*/g, "(.*)");
		
		if (finalPattern.indexOf("^") !== 0)
		{
			finalPattern = "(.*)" + finalPattern;
		}

		if (finalPattern.indexOf("$") !== finalPattern.length-1)
		{
			finalPattern = finalPattern + "(.*)";
		}
		
		//create regular expression from clean pattern
		var rePattern = new RegExp(finalPattern);
		
		var pattern = new Object()
		pattern.found = false;
		pattern.order = i;
		pattern.re = rePattern;
		pattern.line = 0;
		pattern.pattern = patterns[i];
		
		matchPatterns.push(pattern);

	}

	return matchPatterns;
}



/*
* List a directory
* Receive: directory path
* Return: filename list
*/
function listFiles(directory)
{
	var filenames = [];

	try
	{
		var files = fs.readdirSync(directory);
		
		for(var i in files)
		{
			var stat = fs.statSync(directory+'/'+files[i]);
			
			if(!stat.isDirectory())
			{
				filenames.push(files[i]);
			}
		}
	}
	catch(err)
	{
		var ex = new FileError();
		ex.message = "Path doesn't exist.";
		throw ex;
	}
	
	return filenames;
}



/*
* Create match position for a file
* Receive: 
* - request object to get information
* - current log path
* - match pattern object containing the regular expression that will be applied
* Return: filename list
*/
function createMatchPosition(request, filePath, matchPattern)
{
	var matchPosition = null;
	
	if (request.position === -1)
	{
		// Read from last position.
		
		if (request.matchPosition.timestamp === -1)
		{
			// -1, -1
			try
			{
				matchPosition = readLineFromDisk(filePath, matchPattern.re);
			}
			catch (err)
			{
				// On error start from line 0, first file.
				matchPosition = new Object();
				matchPosition.line = 0;
				matchPosition.timestamp = 0;
			}
		}
		else
		{
			// -1, TS
			try
			{
				matchPosition = readLineFromDisk(filePath, matchPattern.re);
				matchPosition.timestamp = request.matchPosition.timestamp;
			}
			catch (err)
			{
				// On error start from line 0.
				matchPosition = new Object();
				matchPosition.line = 0;
				matchPosition.timestamp = request.matchPosition.timestamp; 
			}
		}
	}
	else
	{
		// Read from given position.

		if (request.matchPosition.timestamp === -1)
		{
			// POS, -1
			try
			{
				matchPosition = readLineFromDisk(filePath, matchPattern.re);
				matchPosition.line = request.position;
			}
			catch (err)
			{
				// On error start from given line of the first file.
				matchPosition = new Object();
				matchPosition.line = request.position;
				matchPosition.timestamp = 0;

			}
		}
		else
		{
			// POS, TS
			matchPosition = request.matchPosition;
		}
	}

	return matchPosition;
}



/*
* Read file context from disk for a given file path and regular expression
* Receive: 
* - current log path
* - regular expression that will be applied
* Return: match position saved in context file.
*/
function readLineFromDisk(filePath, pattern)
{
	var statusFilePath = createStatusFileName(filePath, pattern);
	
	var file = fs.readFileSync(statusFilePath, 'utf8');
	
	var parts = file.toString('utf8').split("|");

	var line = parseInt(parts[0]);
	var timestamp = parseInt(parts[1]);

	var matchPosition = new Object()
	matchPosition.line = line
	matchPosition.timestamp = timestamp

	return matchPosition;

}


/*
* Save context file to disk
* Receive:
* - line number (match position) 
* - timestamp
* - current log file complete path
* - current regular expression
*/
function saveLineToDisk(lineNumber, timestamp, filePathPrefix, pattern)
{
	var statusFilePath = createStatusFileName(filePathPrefix, pattern);
	
	if (!fs.existsSync(__dirname+tempDir)) {
	
		try
		{
			fs.mkdirSync( __dirname+tempDir);
		}
		catch(e)
		{
			var ex = new CreateTmpDirError();
			ex.message = e.message;
			errorHandler(ex);
		}
	}

	
	try
	{
		fs.writeFileSync(statusFilePath, (lineNumber + "|" + timestamp));
	}
	catch(err)
	{
		var ex = new WriteOnTmpFileError();
		ex.message = err.message;
		errorHandler(ex);
	}
	
}

/*
* Create an unique file name
* Receive:
* - log file compete path
* - current regular expression
* Return: Unique file name
*/
function createStatusFileName(filePath, pattern)
{
	return __dirname +  tempDir + "/log_parser_monitor_" + md5(filePath + "|" + pattern) + ".dat";
}



//####################### EXCEPTIONS ################################

//All exceptions used in script

function InvalidParametersNumberError() {
    this.name = "InvalidParametersNumberError";
    this.message = "Wrong number of parameters.";
	this.code = 3;
}
InvalidParametersNumberError.prototype = Object.create(Error.prototype);
InvalidParametersNumberError.prototype.constructor = InvalidParametersNumberError;

function InvalidDateError() {
    this.name = "InvalidDateError";
    this.message = "Invalid date.";
	this.code = 16;
}
InvalidDateError.prototype = Object.create(Error.prototype);
InvalidDateError.prototype.constructor = InvalidDateError;


function FileError() {
    this.name = "FileError";
    this.message = "";
	this.code = 15;
}
FileError.prototype = Object.create(Error.prototype);
FileError.prototype.constructor = FileError;


function CreateTmpDirError()
{
	this.name = "CreateTmpDirError";
    this.message = "";
	this.code = 21;
}
CreateTmpDirError.prototype = Object.create(Error.prototype);
CreateTmpDirError.prototype.constructor = CreateTmpDirError;


function WriteOnTmpFileError()
{
	this.name = "WriteOnTmpFileError";
    this.message = "";
	this.code = 22;
}
WriteOnTmpFileError.prototype = Object.create(Error.prototype);
WriteOnTmpFileError.prototype.constructor = WriteOnTmpFileError;


