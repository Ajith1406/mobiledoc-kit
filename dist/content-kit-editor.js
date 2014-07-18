/*!
 * @overview ContentKit-Editor: A modern, minimalist WYSIWYG editor.
 * @version  0.1.0
 * @author   Garth Poitras <garth22@gmail.com> (http://garthpoitras.com/)
 * @license  MIT
 * Last modified: Jul 17, 2014
 */

(function(exports, document) {

'use strict';

/**
 * @namespace ContentKit
 */
var ContentKit = exports.ContentKit || {};
exports.ContentKit = ContentKit;

var Keycodes = {
  ENTER : 13,
  ESC   : 27
};

var Regex = {
  NEWLINE       : /[\r\n]/g,
  HTTP_PROTOCOL : /^https?:\/\//i,
  HEADING_TAG   : /^(H1|H2|H3|H4|H5|H6)$/i,
  UL_START      : /^[-*]\s/,
  OL_START      : /^1\.\s/
};

var SelectionDirection = {
  LEFT_TO_RIGHT : 1,
  RIGHT_TO_LEFT : 2,
  SAME_NODE     : 3
};

var ToolbarDirection = {
  TOP   : 1,
  RIGHT : 2
};

var Tags = {
  PARAGRAPH    : 'P',
  HEADING      : 'H2',
  SUBHEADING   : 'H3',
  QUOTE        : 'BLOCKQUOTE',
  LIST         : 'UL',
  ORDERED_LIST : 'OL',
  LIST_ITEM    : 'LI',
  LINK         : 'A',
  BOLD         : 'B',
  ITALIC       : 'I'
};

var RootTags = [ Tags.PARAGRAPH, Tags.HEADING, Tags.SUBHEADING, Tags.QUOTE, Tags.LIST, Tags.ORDERED_LIST ];

function extend(object, updates) {
  updates = updates || {};
  for(var o in updates) {
    if (updates.hasOwnProperty(o)) {
      object[o] = updates[o];
    }
  }
  return object;
}

function inherits(Subclass, Superclass) {
  Subclass._super = Superclass;
  Subclass.prototype = Object.create(Superclass.prototype, {
    constructor: {
      value: Subclass,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
}

function createDiv(className) {
  var div = document.createElement('div');
  if (className) {
    div.className = className;
  }
  return div;
}

function hideElement(element) {
  element.style.display = 'none';
}

function showElement(element) {
  element.style.display = 'block';
}

function swapElements(elementToShow, elementToHide) {
  hideElement(elementToHide);
  showElement(elementToShow);
}

function getEventTargetMatchingTag(tag, target, container) {
  // Traverses up DOM from an event target to find the node matching specifed tag
  while (target && target !== container) {
    if (target.tagName === tag) {
      return target;
    }
    target = target.parentNode;
  }
}

function getElementRelativeOffset(element) {
  var offset = { left: 0, top: -window.pageYOffset };
  var offsetParent = element.offsetParent;
  var offsetParentPosition = window.getComputedStyle(offsetParent).position;
  var offsetParentRect;

  if (offsetParentPosition === 'relative') {
    offsetParentRect = offsetParent.getBoundingClientRect();
    offset.left = offsetParentRect.left;
    offset.top  = offsetParentRect.top;
  }
  return offset;
}

function getElementComputedStyleNumericProp(element, prop) {
  return parseFloat(window.getComputedStyle(element)[prop]);
}

function positionElementToRect(element, rect, topOffset, leftOffset) {
  var relativeOffset = getElementRelativeOffset(element);
  var style = element.style;
  var round = Math.round;

  topOffset = topOffset || 0;
  leftOffset = leftOffset || 0;
  style.left = round(rect.left - relativeOffset.left - leftOffset) + 'px';
  style.top  = round(rect.top  - relativeOffset.top  - topOffset) + 'px';
}

function positionElementHorizontallyCenteredToRect(element, rect, topOffset) {
  var horizontalCenter = (element.offsetWidth / 2) - (rect.width / 2);
  positionElementToRect(element, rect, topOffset, horizontalCenter);
}

function positionElementCenteredAbove(element, aboveElement) {
  var elementMargin = getElementComputedStyleNumericProp(element, 'marginBottom');
  positionElementHorizontallyCenteredToRect(element, aboveElement.getBoundingClientRect(), element.offsetHeight + elementMargin);
}

function positionElementCenteredBelow(element, belowElement) {
  var elementMargin = getElementComputedStyleNumericProp(element, 'marginTop');
  positionElementHorizontallyCenteredToRect(element, belowElement.getBoundingClientRect(), -element.offsetHeight - elementMargin);
}

function positionElementToLeftOf(element, leftOfElement) {
  var verticalCenter = (leftOfElement.offsetHeight / 2) - (element.offsetHeight / 2);
  var elementMargin = getElementComputedStyleNumericProp(element, 'marginRight');
  positionElementToRect(element, leftOfElement.getBoundingClientRect(), -verticalCenter, element.offsetWidth + elementMargin);
}

function positionElementToRightOf(element, rightOfElement) {
  var verticalCenter = (rightOfElement.offsetHeight / 2) - (element.offsetHeight / 2);
  var elementMargin = getElementComputedStyleNumericProp(element, 'marginLeft');
  var rightOfElementRect = rightOfElement.getBoundingClientRect();
  positionElementToRect(element, rightOfElementRect, -verticalCenter, -rightOfElement.offsetWidth - elementMargin);
}

function getDirectionOfSelection(selection) {
  var position = selection.anchorNode.compareDocumentPosition(selection.focusNode);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    return SelectionDirection.LEFT_TO_RIGHT;
  } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
    return SelectionDirection.RIGHT_TO_LEFT;
  }
  return SelectionDirection.SAME_NODE;
}

function getCurrentSelectionNode(selection) {
  selection = selection || window.getSelection();
  var node = getDirectionOfSelection(selection) === SelectionDirection.LEFT_TO_RIGHT ? selection.anchorNode : selection.focusNode;
  return node && (node.nodeType === 3 ? node.parentNode : node);
}

function getCurrentSelectionRootNode() {
  var node = getCurrentSelectionNode();
  var tag = node.tagName;
  while (tag && RootTags.indexOf(tag) === -1) {
    if (node.contentEditable === 'true') { break; } // Stop traversing up dom when hitting an editor element
    node = node.parentNode;
    tag = node.tagName;
  }
  return node;
}

function getCurrentSelectionTag() {
  var node = getCurrentSelectionNode();
  return node ? node.tagName : null;
}

function getCurrentSelectionRootTag() {
  var node = getCurrentSelectionRootNode();
  return node ? node.tagName : null;
}

function tagsInSelection(selection) {
  var node = getCurrentSelectionNode(selection);
  var tags = [];
  if (!selection.isCollapsed) {
    while(node) {
      if (node.contentEditable === 'true') { break; } // Stop traversing up dom when hitting an editor element
      if (node.tagName) {
        tags.push(node.tagName);
      }
      node = node.parentNode;
    }
  }
  return tags;
}

function selectionIsInElement(selection, element) {
  var node = selection.focusNode,
      parentNode = node.parentNode;
  while(parentNode) {
    if (parentNode === element) {
      return true;
    }
    parentNode = parentNode.parentNode;
  }
  return false;
}

function moveCursorToBeginningOfSelection(selection) {
  var range = document.createRange();
  var node  = selection.anchorNode;
  range.setStart(node, 0);
  range.setEnd(node, 0);
  selection.removeAllRanges();
  selection.addRange(range);
}

function restoreRange(range) {
  var selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectNode(node) {
  var range = document.createRange();
  var selection = window.getSelection();
  range.setStart(node, 0);
  range.setEnd(node, node.length);
  selection.removeAllRanges();
  selection.addRange(range);
}

var Prompt = (function() {

  var container = document.body;
  var hiliter = createDiv('ck-editor-hilite');

  function Prompt(options) {
    if (options) {
      var prompt = this;
      var element = document.createElement('input');
      prompt.command = options.command;
      prompt.element = element;
      element.type = 'text';
      element.placeholder = options.placeholder || '';
      element.addEventListener('mouseup', function(e) { e.stopPropagation(); }); // prevents closing prompt when clicking input 
      element.addEventListener('keyup', function(e) {
        var entry = this.value;
        if(entry && !e.shiftKey && e.which === Keycodes.ENTER) {
          restoreRange(prompt.range);
          prompt.command.exec(entry);
          if (prompt.onComplete) { prompt.onComplete(); }
        }
      });

      window.addEventListener('resize', function() {
        var activeHilite = hiliter.parentNode;
        var range = prompt.range;
        if(activeHilite && range) {
          positionHiliteRange(range);
        }
      });
    }
  }

  Prompt.prototype = {
    display: function(callback) {
      var prompt = this;
      var element = prompt.element;
      prompt.range = window.getSelection().getRangeAt(0); // save the selection range
      container.appendChild(hiliter);
      positionHiliteRange(prompt.range);
      prompt.clear();
      setTimeout(function(){ element.focus(); }); // defer focus (disrupts mouseup events)
      if (callback) { prompt.onComplete = callback; }
    },
    dismiss: function() {
      this.clear();
      container.removeChild(hiliter);
    },
    clear: function() {
      this.element.value = null;
    }
  };

  function positionHiliteRange(range) {
    var rect = range.getBoundingClientRect();
    var style = hiliter.style;
    style.width  = rect.width  + 'px';
    style.height = rect.height + 'px';
    positionElementToRect(hiliter, rect);
  }

  return Prompt;
}());

function createCommandIndex(commands) {
  var index = {};
  var len = commands.length, i, command;
  for(i = 0; i < len; i++) {
    command = commands[i];
    index[command.name] = command;
  }
  return index;
}

function Command(options) {
  var command = this;
  var name = options.name;
  var prompt = options.prompt;
  command.name = name;
  command.button = options.button || name;
  if (prompt) { command.prompt = prompt; }
}
Command.prototype.exec = function(){};

function TextFormatCommand(options) {
  Command.call(this, options);
  this.tag = options.tag;
  this.action = options.action || this.name;
  this.removeAction = options.removeAction || this.action;
}
inherits(TextFormatCommand, Command);

TextFormatCommand.prototype = {
  exec: function(value) {
    document.execCommand(this.action, false, value || null);
  },
  unexec: function(value) {
    document.execCommand(this.removeAction, false, value || null);
  }
};

function BoldCommand() {
  TextFormatCommand.call(this, {
    name: 'bold',
    tag: Tags.BOLD,
    button: '<i class="ck-icon-bold"></i>'
  });
}
inherits(BoldCommand, TextFormatCommand);
BoldCommand.prototype.exec = function() {
  // Don't allow executing bold command on heading tags
  if (!Regex.HEADING_TAG.test(getCurrentSelectionRootTag())) {
    BoldCommand._super.prototype.exec.call(this);
  }
};

function ItalicCommand() {
  TextFormatCommand.call(this, {
    name: 'italic',
    tag: Tags.ITALIC,
    button: '<i class="ck-icon-italic"></i>'
  });
}
inherits(ItalicCommand, TextFormatCommand);

function LinkCommand() {
  TextFormatCommand.call(this, {
    name: 'link',
    tag: Tags.LINK,
    action: 'createLink',
    removeAction: 'unlink',
    button: '<i class="ck-icon-link"></i>',
    prompt: new Prompt({
      command: this,
      placeholder: 'Enter a url, press return...'
    })
  });
}
inherits(LinkCommand, TextFormatCommand);
LinkCommand.prototype.exec = function(url) {
  if(this.tag === getCurrentSelectionTag()) {
    this.unexec();
  } else {
    if (!Regex.HTTP_PROTOCOL.test(url)) {
      url = 'http://' + url;
    }
    LinkCommand._super.prototype.exec.call(this, url);
  }
};

function FormatBlockCommand(options) {
  options.action = 'formatBlock';
  TextFormatCommand.call(this, options);
}
inherits(FormatBlockCommand, TextFormatCommand);
FormatBlockCommand.prototype.exec = function() {
  var tag = this.tag;
  // Brackets neccessary for certain browsers
  var value =  '<' + tag + '>';
  var rootNode = getCurrentSelectionRootNode();
  // Allow block commands to be toggled back to a paragraph
  if(tag === rootNode.tagName) {
    value = Tags.PARAGRAPH;
  } else {
    // Flattens the selection before applying the block format.
    // Otherwise, undesirable nested blocks can occur.
    var flatNode = document.createTextNode(rootNode.textContent);
    rootNode.parentNode.insertBefore(flatNode, rootNode);
    rootNode.parentNode.removeChild(rootNode);
    selectNode(flatNode);
  }
  
  FormatBlockCommand._super.prototype.exec.call(this, value);
};

function QuoteCommand() {
  FormatBlockCommand.call(this, {
    name: 'quote',
    tag: Tags.QUOTE,
    button: '<i class="ck-icon-quote"></i>'
  });
}
inherits(QuoteCommand, FormatBlockCommand);

function HeadingCommand() {
  FormatBlockCommand.call(this, {
    name: 'heading',
    tag: Tags.HEADING,
    button: '<i class="ck-icon-heading"></i>1'
  });
}
inherits(HeadingCommand, FormatBlockCommand);

function SubheadingCommand() {
  FormatBlockCommand.call(this, {
    name: 'subheading',
    tag: Tags.SUBHEADING,
    button: '<i class="ck-icon-heading"></i>2'
  });
}
inherits(SubheadingCommand, FormatBlockCommand);

function ListCommand(options) {
  TextFormatCommand.call(this, options);
}
inherits(ListCommand, TextFormatCommand);
ListCommand.prototype.exec = function() {
  ListCommand._super.prototype.exec.call(this);
  
  // After creation, lists need to be unwrapped from the default formatter P tag
  var listNode = getCurrentSelectionRootNode();
  var wrapperNode = listNode.parentNode;
  if (wrapperNode.firstChild === listNode) {
    var editorNode = wrapperNode.parentNode;
    editorNode.insertBefore(listNode, wrapperNode);
    editorNode.removeChild(wrapperNode);
    selectNode(listNode);
  }
};

function UnorderedListCommand() {
  ListCommand.call(this, {
    name: 'list',
    tag: Tags.LIST,
    action: 'insertUnorderedList'
  });
}
inherits(UnorderedListCommand, ListCommand);

function OrderedListCommand() {
  ListCommand.call(this, {
    name: 'ordered list',
    tag: Tags.ORDERED_LIST,
    action: 'insertOrderedList'
  });
}
inherits(OrderedListCommand, ListCommand);

TextFormatCommand.all = [
  new BoldCommand(),
  new ItalicCommand(),
  new LinkCommand(),
  new QuoteCommand(),
  new HeadingCommand(),
  new SubheadingCommand()
];

TextFormatCommand.index = createCommandIndex(TextFormatCommand.all);


function EmbedCommand(options) {
  Command.call(this, options);
}
inherits(EmbedCommand, Command);
EmbedCommand.prototype.exec = function() {
  alert(this.name);
};

function ImageEmbedCommand(options) {
  EmbedCommand.call(this, {
    name: 'image',
    button: '<i class="ck-icon-image"></i>'
  });

  var fileBrowser = document.createElement('input');
  fileBrowser.type = 'file';
  fileBrowser.accept = 'image/*';
  fileBrowser.className = 'ck-file-input';
  fileBrowser.addEventListener('change', this.handleFile);
  document.body.appendChild(fileBrowser);
  this.fileBrowser = fileBrowser;
}
inherits(ImageEmbedCommand, EmbedCommand);
ImageEmbedCommand.prototype = {
  exec: function() {
    var clickEvent = new MouseEvent('click', { bubbles: false });
    this.fileBrowser.dispatchEvent(clickEvent);
  },
  handleFile: function(e) {
    var target = e.target;
    var file = target && target.files[0];
    var reader = new FileReader();
    reader.onload = function(event) {
      var base64File = event.target.result;
      var selectionRoot = getCurrentSelectionRootNode();
      var image = document.createElement('img');
      image.src = base64File;

      // image needs to be placed outside of the current empty paragraph
      var editorNode = selectionRoot.parentNode;
      editorNode.insertBefore(image, selectionRoot);
      editorNode.removeChild(selectionRoot);
    };
    reader.readAsDataURL(file);
    target.value = null; // reset
  }
};

function MediaEmbedCommand(options) {
  EmbedCommand.call(this, {
    name: 'media',
    button: '<i class="ck-icon-embed"></i>',
    prompt: new Prompt({
      command: this,
      placeholder: 'Enter a twitter, or youtube url...'
    })
  });
}
inherits(MediaEmbedCommand, EmbedCommand);

EmbedCommand.all = [
  new ImageEmbedCommand(),
  new MediaEmbedCommand()
];

EmbedCommand.index = createCommandIndex(EmbedCommand.all);

ContentKit.Editor = (function() {

  // Default `Editor` options
  var defaults = {
    defaultFormatter: Tags.PARAGRAPH,
    placeholder: 'Write here...',
    spellcheck: true,
    autofocus: true,
    textFormatCommands: TextFormatCommand.all,
    embedCommands: EmbedCommand.all
  };

  var editorClassName = 'ck-editor';
  var editorClassNameRegExp = new RegExp(editorClassName);

  /**
   * Publically expose this class which sets up indiviual `Editor` classes
   * depending if user passes string selector, Node, or NodeList
   */
  function EditorFactory(element, options) {
    var editors = [];
    var elements, elementsLen, i;

    if (typeof element === 'string') {
      elements = document.querySelectorAll(element);
    } else if (element && element.length) {
      elements = element;
    } else if (element) {
      elements = [element];
    }

    if (elements) {
      options = extend(defaults, options);
      elementsLen = elements.length;
      for (i = 0; i < elementsLen; i++) {
        editors.push(new Editor(elements[i], options));
      }
    }

    return editors.length > 1 ? editors : editors[0];
  }

  /**
   * @class Editor
   * An individual Editor
   * @param element `Element` node
   * @param options hash of options
   */
  function Editor(element, options) {
    var editor = this;
    extend(editor, options);

    if (element) {
      var className = element.className;
      var dataset = element.dataset;
      var textFormatToolbar = new Toolbar({ commands: editor.textFormatCommands });

      if (!editorClassNameRegExp.test(className)) {
        className += (className ? ' ' : '') + editorClassName;
      }
      element.className = className;

      if (!dataset.placeholder) {
        dataset.placeholder = editor.placeholder;
      }
      if(!editor.spellcheck) {
        element.spellcheck = false;
      }

      element.setAttribute('contentEditable', true);
      editor.element = element;
      editor.textFormatToolbar = textFormatToolbar;

      var linkTooltips = new Tooltip({ rootElement: element, showForTag: Tags.LINK });

      if(editor.embedCommands) {
        var embedIntent = new EmbedIntent({
          commands: editor.embedCommands,
          rootElement: element
        });
      }

      bindTextSelectionEvents(editor);
      bindTypingEvents(editor);
      bindPasteEvents(editor);
      
      if(editor.autofocus) { element.focus(); }
    }
  }

  Editor.prototype = {
    parse: function() {
      var editor = this;
      if (!editor.parser) {
        if (!ContentKit.HTMLParser) {
          throw new Error('Include the ContentKit compiler for parsing');
        }
        editor.parser = new ContentKit.HTMLParser();
      }
      return editor.parser.parse(editor.element.innerHTML);
    }
  };

  function bindTextSelectionEvents(editor) {
    // Mouse text selection
    document.addEventListener('mouseup', function(e) {
      setTimeout(function(){ handleTextSelection(e, editor); });
    });

    // Keyboard text selection
    editor.element.addEventListener('keyup', function(e) {
      handleTextSelection(e, editor);
    });
  }

  function bindTypingEvents(editor) {
    var editorEl = editor.element;

    // Breaks out of blockquotes when pressing enter.
    editorEl.addEventListener('keyup', function(e) {
      if(!e.shiftKey && e.which === Keycodes.ENTER) {
        if(Tags.QUOTE === getCurrentSelectionRootTag()) {
          document.execCommand('formatBlock', false, editor.defaultFormatter);
          e.stopPropagation();
        }
      }
    });

    // Creates unordered list when block starts with '- ', or ordered if starts with '1. '
    editorEl.addEventListener('keyup', function(e) {
      var selectedText = window.getSelection().anchorNode.textContent,
          selection, selectionNode, command, replaceRegex;

      if (Tags.LIST_ITEM !== getCurrentSelectionTag()) {
        if (Regex.UL_START.test(selectedText)) {
          command = new UnorderedListCommand();
          replaceRegex = Regex.UL_START;
        } else if (Regex.OL_START.test(selectedText)) {
          command = new OrderedListCommand();
          replaceRegex = Regex.OL_START;
        }

        if (command) {
          command.exec();
          selection = window.getSelection();
          selectionNode = selection.anchorNode;
          selectionNode.textContent = selectedText.replace(replaceRegex, '');
          moveCursorToBeginningOfSelection(selection);
          e.stopPropagation();
        }
      }
    });

    // Assure there is always a supported root tag, and not empty text nodes or divs.
    // Usually only happens when selecting all and deleting content.
    editorEl.addEventListener('keyup', function() {
      if (this.innerHTML.length && RootTags.indexOf(getCurrentSelectionRootTag()) === -1) {
        document.execCommand('formatBlock', false, editor.defaultFormatter);
      }
    });
  }

  function handleTextSelection(e, editor) {
    var selection = window.getSelection();
    if (selection.isCollapsed || selection.toString().trim() === '' || !selectionIsInElement(selection, editor.element)) {
      editor.textFormatToolbar.hide();
    } else {
      editor.textFormatToolbar.updateForSelection(selection);
    }
  }

  function bindPasteEvents(editor) {
    editor.element.addEventListener('paste', function(e) {
      var data = e.clipboardData, plainText;
      e.preventDefault();
      if(data && data.getData) {
        plainText = data.getData('text/plain');
        var formattedContent = plainTextToBlocks(plainText, editor.defaultFormatter);
        document.execCommand('insertHTML', false, formattedContent);
      }
    });
  }

  function plainTextToBlocks(plainText, blockTag) {
    var blocks = plainText.split(Regex.NEWLINE),
        len = blocks.length,
        block, openTag, closeTag, content, i;
    if(len < 2) {
      return plainText;
    } else {
      content = '';
      openTag = '<' + blockTag + '>';
      closeTag = '</' + blockTag + '>';
      for(i=0; i<len; ++i) {
        block = blocks[i];
        if(block !== '') {
          content += openTag + block + closeTag;
        }
      }
      return content;
    }
  }

  return EditorFactory;
}());

var Toolbar = (function() {

  var container = document.body;

  function Toolbar(options) {
    var toolbar = this;
    var commands = options && options.commands;
    var commandCount = commands && commands.length;
    var element = createDiv('ck-toolbar');
    var i, button;
    toolbar.element = element;
    toolbar.direction = options.direction || ToolbarDirection.TOP;
    if (toolbar.direction === ToolbarDirection.RIGHT) {
      element.className += ' right';
    }
    toolbar.isShowing = false;
    toolbar.activePrompt = null;
    toolbar.buttons = [];
    bindEvents(toolbar);

    toolbar.promptContainerElement = createDiv('ck-toolbar-prompt');
    toolbar.buttonContainerElement = createDiv('ck-toolbar-buttons');
    element.appendChild(toolbar.promptContainerElement);
    element.appendChild(toolbar.buttonContainerElement);

    for(i = 0; i < commandCount; i++) {
      button = new ToolbarButton({ command: commands[i], toolbar: toolbar });
      toolbar.buttons.push(button);
      toolbar.buttonContainerElement.appendChild(button.element);
    }
  }

  Toolbar.prototype = {
    show: function() {
      var toolbar = this;
      if(!toolbar.isShowing) {
        container.appendChild(toolbar.element);
        toolbar.isShowing = true;
      }
    },
    hide: function() {
      var toolbar = this;
      var element = toolbar.element;
      var style = element.style;
      if(toolbar.isShowing) {
        container.removeChild(element);
        style.left = '';
        style.top = '';
        toolbar.dismissPrompt();
        toolbar.isShowing = false;
      }
    },
    displayPrompt: function(prompt) {
      var toolbar = this;
      swapElements(toolbar.promptContainerElement, toolbar.buttonContainerElement);
      toolbar.promptContainerElement.appendChild(prompt.element);
      prompt.display(function() {
        toolbar.dismissPrompt();
        toolbar.updateForSelection(window.getSelection());
      });
      toolbar.activePrompt = prompt;
    },
    dismissPrompt: function() {
      var toolbar = this;
      var activePrompt = toolbar.activePrompt;
      if (activePrompt) {
        activePrompt.dismiss();
        swapElements(toolbar.buttonContainerElement, toolbar.promptContainerElement);
        toolbar.activePrompt = null;
      }
    },
    updateForSelection: function(selection) {
      var toolbar = this;
      if (selection.isCollapsed) {
        toolbar.hide();
      } else {
        toolbar.show();
        toolbar.positionToContent(selection.getRangeAt(0));
        updateButtonsForSelection(toolbar.buttons, selection);
      }
    },
    positionToContent: function(content) {
      var directions = ToolbarDirection;
      var positioningMethod;
      switch(this.direction) {
        case directions.RIGHT:
          positioningMethod = positionElementToRightOf;
          break;
        default:
          positioningMethod = positionElementCenteredAbove;
      }
      positioningMethod(this.element, content);
    }
  };

  function bindEvents(toolbar) {
    document.addEventListener('keyup', function(e) {
      if (e.keyCode === Keycodes.ESC) {
        toolbar.hide();
      }
    });

    window.addEventListener('resize', function() {
      var activePrompt = toolbar.activePrompt;
      if(toolbar.isShowing) {
        toolbar.positionToContent(activePrompt ? activePrompt.range : window.getSelection().getRangeAt(0));
      }
    });
  }

  function updateButtonsForSelection(buttons, selection) {
    var selectedTags = tagsInSelection(selection),
        len = buttons.length,
        i, button;

    for (i = 0; i < len; i++) {
      button = buttons[i];
      if (selectedTags.indexOf(button.command.tag) > -1) {
        button.setActive();
      } else {
        button.setInactive();
      }
    }
  }

  return Toolbar;
}());

var ToolbarButton = (function() {

  var buttonClassName = 'ck-toolbar-btn';

  function ToolbarButton(options) {
    var button = this;
    var toolbar = options.toolbar;
    var command = options.command;
    var prompt = command.prompt;
    var element = document.createElement('button');

    if(typeof command === 'string') {
      command = Command.index[command];
    }

    button.element = element;
    button.command = command;
    button.isActive = false;

    element.title = command.name;
    element.className = buttonClassName;
    element.innerHTML = command.button;
    element.addEventListener('click', function(e) {
      if (!button.isActive && prompt) {
        toolbar.displayPrompt(prompt);
      } else {
        command.exec();
      }
    });
  }

  ToolbarButton.prototype = {
    setActive: function() {
      var button = this;
      if (!button.isActive) {
        button.element.className = buttonClassName + ' active';
        button.isActive = true;
      }
    },
    setInactive: function() {
      var button = this;
      if (button.isActive) {
        button.element.className = buttonClassName;
        button.isActive = false;
      }
    }
  };

  return ToolbarButton;
}());

var Tooltip = (function() {

  var container = document.body;
  var className = 'ck-tooltip';
  var delay = 200;

  function Tooltip(options) {
    var tooltip = this;
    var rootElement = options.rootElement;
    var timeout;

    tooltip.element = createDiv(className);
    tooltip.isShowing = false;

    rootElement.addEventListener('mouseover', function(e) {
      var target = getEventTargetMatchingTag(options.showForTag, e.target, rootElement);
      if (target) {
        timeout = setTimeout(function() {
          tooltip.showLink(target.href, target);
        }, delay);
      }
    });
    
    rootElement.addEventListener('mouseout', function(e) {
      clearTimeout(timeout);
      var toElement = e.toElement || e.relatedTarget;
      if (toElement && toElement.className !== className) {
        tooltip.hide();
      }
    });
  }

  Tooltip.prototype = {
    showMessage: function(message, element) {
      var tooltip = this;
      var tooltipElement = tooltip.element;

      tooltipElement.innerHTML = message;
      if (!tooltip.isShowing) {
        container.appendChild(tooltipElement);
        tooltip.isShowing = true;
      }
      positionElementCenteredBelow(tooltipElement, element);
    },
    showLink: function(link, element) {
      var message = '<a href="' + link + '" target="_blank">' + link + '</a>';
      this.showMessage(message, element);
    },
    hide: function() {
      var tooltip = this;
      if (tooltip.isShowing) {
        container.removeChild(tooltip.element);
        tooltip.isShowing = false;
      }
    }
  };

  return Tooltip;
}());

var EmbedIntent = (function() {

  var container = document.body;
  var className = 'ck-embed-intent-btn';

  function EmbedIntent(options) {
    var embedIntent = this;
    var element = document.createElement('button');
    var rootElement = options.rootElement;
    element.className = className;
    element.title = 'Insert image or embed...';
    element.addEventListener('mouseup', function(e) {
      if (embedIntent.isActive) {
        embedIntent.deactivate();
      } else {
        embedIntent.activate();
      }
      e.stopPropagation();
    });
    embedIntent.element = element;
    embedIntent.toolbar = new Toolbar({ commands: options.commands, direction: ToolbarDirection.RIGHT });
    embedIntent.isShowing = false;
    embedIntent.isActive = false;

    function embedIntentHandler(e) {
      var currentNode = getCurrentSelectionRootNode();
      var currentNodeHTML = currentNode.innerHTML;
      if (currentNodeHTML === '' || currentNodeHTML === '<br>') {
        embedIntent.showAt(currentNode);
      } else {
        embedIntent.hide();
      }
      e.stopPropagation();
    }

    rootElement.addEventListener('keyup', embedIntentHandler);
    document.addEventListener('mouseup', embedIntentHandler);

    window.addEventListener('resize', function() {
      if(embedIntent.isShowing) {
        positionElementToLeftOf(embedIntent.element, embedIntent.atNode);
      }
    });
  }

  EmbedIntent.prototype = {
    show: function() {
      if (!this.isShowing) {
        container.appendChild(this.element);
        this.isShowing = true;
      }
    },
    showAt: function(node) {
      this.show();
      this.atNode = node;
      positionElementToLeftOf(this.element, node);
    },
    hide: function() {
      if (this.isShowing) {
        container.removeChild(this.element);
        this.deactivate();
        this.isShowing = false;
      }
    },
    activate: function() {
      if (!this.isActive) {
        this.element.className = className + ' activated';
        this.toolbar.show();
        this.toolbar.positionToContent(this.element);
        this.isActive = true;
      }
    },
    deactivate: function() {
      if (this.isActive) {
        this.element.className = className;
        this.toolbar.hide();
        this.isActive = false;
      }
    }
  };

  return EmbedIntent;
}());

}(this, document));
