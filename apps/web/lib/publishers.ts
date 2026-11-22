import { maskComments } from "@/lib/latex-active";
import type { ProjectFile } from "@/lib/project-files";

export type PublisherId =
  | "elsevier"
  | "ieee"
  | "springer-nature"
  | "ams"
  | "acm"
  | "siam"
  | "aps"
  | "oxford-wiley";

export interface PublisherSnippet {
  id: string;
  name: string;
  description: string;
  category: "frontmatter" | "theorem" | "table-figure";
  placement?: "cursor" | "before-end" | "frontmatter";
  snippet: string;
}

export interface PublisherTemplate {
  id: PublisherId;
  name: string;
  shortName: string;
  publisherGroup: string;
  description: string;
  columns: "1-col" | "2-col";
  columnLabel: string;
  documentClass: string;
  recommendedBibStyle: string;
  acceptedBibStyles: string[];
  subjectClassLabel: string;
  subjectClassPlaceholder: string;
  exampleJournals: string[];
  requiresHighlights?: boolean;
  requiresDeclarations?: boolean;
  requiresCreditStatement?: boolean;
  requiresPacsOrSubjectClass?: boolean;
  mainFileName: string;
  files: Omit<ProjectFile, "id">[];
  snippets: PublisherSnippet[];
}

export interface ManuscriptParts {
  title: string;
  authors: string;
  affiliation: string;
  email: string;
  abstractText: string;
  keywords: string;
  subjectClass: string;
  bodyContent: string;
  bibliographyName: string;
}

export type ComplianceQuickFixId =
  | "abstract"
  | "keywords"
  | "subject-class"
  | "bibstyle"
  | "highlights"
  | "declarations"
  | "data-availability"
  | "ai-disclosure";

export interface PublisherComplianceItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  required: boolean;
  quickFixId?: ComplianceQuickFixId;
  quickFixLabel?: string;
}

const SHARED_REFERENCES_BIB = `@article{saad1986gmres,
  author  = {Saad, Youcef and Schultz, Martin H.},
  title   = {{GMRES}: A Generalized Minimal Residual Algorithm for Solving Nonsymmetric Linear Systems},
  journal = {SIAM Journal on Scientific and Statistical Computing},
  year    = {1986},
  volume  = {7},
  number  = {3},
  pages   = {856--869},
  doi     = {10.1137/0907058}
}

@article{candes2006robust,
  author  = {Cand{\\\`e}s, Emmanuel J. and Romberg, Justin and Tao, Terence},
  title   = {Robust Uncertainty Principles: Exact Signal Reconstruction from Highly Incomplete Frequency Information},
  journal = {IEEE Transactions on Information Theory},
  year    = {2006},
  volume  = {52},
  number  = {2},
  pages   = {489--509},
  doi     = {10.1109/TIT.2005.862083}
}

@article{bottou2018optimization,
  author  = {Bottou, L{\\'e}on and Curtis, Frank E. and Nocedal, Jorge},
  title   = {Optimization Methods for Large-Scale Machine Learning},
  journal = {SIAM Review},
  year    = {2018},
  volume  = {60},
  number  = {2},
  pages   = {223--311},
  doi     = {10.1137/16M1080173}
}

@article{donoho2006compressed,
  author  = {Donoho, David L.},
  title   = {Compressed Sensing},
  journal = {IEEE Transactions on Information Theory},
  year    = {2006},
  volume  = {52},
  number  = {4},
  pages   = {1289--1306},
  doi     = {10.1109/TIT.2006.871582}
}

@article{lax1956survey,
  author  = {Lax, Peter D. and Richtmyer, Robert D.},
  title   = {Survey of the Stability of Linear Finite Difference Equations},
  journal = {Communications on Pure and Applied Mathematics},
  year    = {1956},
  volume  = {9},
  number  = {2},
  pages   = {267--293},
  doi     = {10.1002/cpa.3160090206}
}
`;

// ---------------------------------------------------------------------------
// Self-contained portable style files for classes missing from minimal TeX
// distributions (Springer Nature sn-jnl, ACM SIGCONF, SIAM, APS, Oxford/Wiley)
// ---------------------------------------------------------------------------

const SN_JNL_PORTABLE_STY = `\\NeedsTeXFormat{LaTeX2e}
\\ProvidesPackage{sn-jnl-portable}[2025/01/01 Portable Springer Nature Journal Compatibility Package]

\\RequirePackage[margin=1in]{geometry}
\\RequirePackage{amsmath,amssymb,amsthm}
\\RequirePackage{graphicx}
\\RequirePackage{booktabs}
\\RequirePackage{xcolor}
\\RequirePackage{fancyhdr}
\\RequirePackage[numbers,sort&compress]{natbib}
\\RequirePackage{hyperref}

\\hypersetup{
  colorlinks=true,
  linkcolor=blue!55!black,
  citecolor=blue!55!black,
  urlcolor=blue!55!black
}

\\gdef\\sn@title{}
\\gdef\\sn@shorttitle{}
\\gdef\\sn@authors{}
\\gdef\\sn@affils{}
\\gdef\\sn@emails{}
\\gdef\\sn@abstract{}
\\gdef\\sn@keywords{}
\\gdef\\sn@pacs{}
\\gdef\\sn@pacslabel{MSC Classification}
\\gdef\\sn@articletype{Research Article}
\\gdef\\sn@jyear{2025}

\\newif\\ifsn@firstauthor\\sn@firstauthortrue
\\newif\\ifsn@firstaffil\\sn@firstaffiltrue
\\newif\\ifsn@firstemail\\sn@firstemailtrue

\\newcommand{\\jyear}[1]{\\gdef\\sn@jyear{#1}}
\\newcommand{\\articletype}[1]{\\gdef\\sn@articletype{#1}}
\\newcommand{\\unnumbered}{}

\\renewcommand{\\title}[2][]{%
  \\gdef\\sn@shorttitle{#1}%
  \\gdef\\sn@title{#2}%
  \\gdef\\@title{#2}%
}

\\newcommand{\\fnm}[1]{#1}
\\newcommand{\\sur}[1]{#1}
\\newcommand{\\equalcont}[1]{}
\\newcommand{\\orgdiv}[1]{#1}
\\newcommand{\\orgname}[1]{#1}
\\newcommand{\\orgaddress}[1]{#1}
\\newcommand{\\street}[1]{#1}
\\newcommand{\\city}[1]{#1}
\\newcommand{\\postcode}[1]{#1}
\\newcommand{\\state}[1]{#1}
\\newcommand{\\country}[1]{#1}

\\newcommand{\\email}[1]{%
  \\ifsn@firstemail
    \\sn@firstemailfalse
    \\gdef\\sn@emails{\\texttt{#1}}%
  \\else
    \\g@addto@macro\\sn@emails{, \\texttt{#1}}%
  \\fi
}

\\def\\sn@addauthor#1#2#3{%
  \\ifsn@firstauthor
    \\sn@firstauthorfalse
  \\else
    \\g@addto@macro\\sn@authors{, }%
  \\fi
  \\g@addto@macro\\sn@authors{#3\\textsuperscript{#2#1}}%
}

\\renewcommand{\\author}{\\@ifstar{\\sn@authorstar}{\\sn@authornostar}}
\\def\\sn@authorstar{\\@ifnextchar[{\\sn@authorstaropt}{\\sn@authorstaropt[]}}
\\def\\sn@authorstaropt[#1]#2{\\sn@addauthor{*}{#1}{#2}}
\\def\\sn@authornostar{\\@ifnextchar[{\\sn@authornostaropt}{\\sn@authornostaropt[]}}
\\def\\sn@authornostaropt[#1]#2{\\sn@addauthor{}{#1}{#2}}

\\def\\sn@addaffil#1#2#3{%
  \\ifsn@firstaffil
    \\sn@firstaffilfalse
  \\else
    \\g@addto@macro\\sn@affils{\\par}%
  \\fi
  \\g@addto@macro\\sn@affils{\\textsuperscript{#2#1}#3}%
}

\\newcommand{\\affil}{\\@ifstar{\\sn@affilstar}{\\sn@affilnostar}}
\\def\\sn@affilstar{\\@ifnextchar[{\\sn@affilstaropt}{\\sn@affilstaropt[]}}
\\def\\sn@affilstaropt[#1]#2{\\sn@addaffil{*}{#1}{#2}}
\\def\\sn@affilnostar{\\@ifnextchar[{\\sn@affilnostaropt}{\\sn@affilnostaropt[]}}
\\def\\sn@affilnostaropt[#1]#2{\\sn@addaffil{}{#1}{#2}}

\\long\\def\\sn@setabstract#1{\\gdef\\sn@abstract{#1}}
\\renewcommand{\\abstract}[1]{\\sn@setabstract{#1}}
\\newcommand{\\keywords}[1]{\\gdef\\sn@keywords{#1}}
\\newcommand{\\pacs}[2][MSC Classification]{\\gdef\\sn@pacslabel{#1}\\gdef\\sn@pacs{#2}}

\\renewcommand{\\maketitle}{%
  \\begingroup
  \\noindent{\\small\\sffamily\\bfseries\\color{blue!50!black}\\MakeUppercase{\\sn@articletype}\\hfill\\sn@jyear}\\par
  \\vspace{0.5em}
  {\\LARGE\\bfseries\\raggedright\\sn@title\\par}
  \\vspace{0.75em}
  \\ifx\\sn@authors\\@empty\\else
    {\\large\\raggedright\\sn@authors\\par}
    \\vspace{0.45em}
  \\fi
  \\ifx\\sn@affils\\@empty\\else
    {\\small\\raggedright\\sn@affils\\par}
    \\vspace{0.35em}
  \\fi
  \\ifx\\sn@emails\\@empty\\else
    {\\small\\raggedright\\textit{Corresponding author(s):} \\sn@emails\\par}
    \\vspace{0.6em}
  \\fi
  \\noindent\\rule{\\textwidth}{0.6pt}\\par
  \\vspace{0.5em}
  \\ifx\\sn@abstract\\@empty\\else
    \\noindent\\textbf{Abstract}\\par\\smallskip
    \\noindent\\small\\sn@abstract\\par
    \\vspace{0.5em}
  \\fi
  \\ifx\\sn@keywords\\@empty\\else
    \\noindent\\small\\textbf{Keywords:} \\sn@keywords\\par
    \\vspace{0.3em}
  \\fi
  \\ifx\\sn@pacs\\@empty\\else
    \\noindent\\small\\textbf{\\sn@pacslabel:} \\sn@pacs\\par
    \\vspace{0.3em}
  \\fi
  \\noindent\\rule{\\textwidth}{0.6pt}\\par
  \\vspace{1em}
  \\endgroup
}

\\newcommand{\\bmhead}[1]{\\par\\medskip\\noindent\\textbf{#1}\\par\\smallskip\\noindent\\ignorespaces}
\\newenvironment{appendices}{\\appendix}{}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\itshape\\sn@articletype}
\\fancyhead[R]{\\small\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}

\\theoremstyle{plain}
\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{corollary}[theorem]{Corollary}

\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}

\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}
`;

const ACM_PORTABLE_STY = `\\NeedsTeXFormat{LaTeX2e}
\\ProvidesPackage{acm-portable}[2025/01/01 Portable ACM Transactions/SIGCONF Compatibility Package]

\\RequirePackage[margin=0.75in,columnsep=0.25in]{geometry}
\\RequirePackage{amsmath,amssymb,amsthm}
\\RequirePackage{graphicx}
\\RequirePackage{booktabs}
\\RequirePackage{xcolor}
\\RequirePackage{fancyhdr}
\\RequirePackage{verbatim}
\\RequirePackage[numbers,sort&compress]{natbib}
\\RequirePackage{hyperref}

\\hypersetup{
  colorlinks=true,
  linkcolor=blue!55!black,
  citecolor=blue!55!black,
  urlcolor=blue!55!black
}

\\gdef\\acm@title{}
\\gdef\\acm@authors{}
\\gdef\\acm@affils{}
\\gdef\\acm@emails{}
\\gdef\\acm@conference{ACM Symposium / Transactions}
\\gdef\\acm@keywords{}
\\gdef\\acm@ccsdesc{}
\\newif\\ifacm@firstauthor\\acm@firstauthortrue
\\newif\\ifacm@firstemail\\acm@firstemailtrue
\\newif\\ifacm@maketitle@done\\acm@maketitle@donefalse

\\renewcommand{\\title}[2][]{\\gdef\\acm@title{#2}\\gdef\\@title{#2}}
\\newcommand{\\acmConference}[4][]{\\gdef\\acm@conference{#2, #3, #4}}
\\newcommand{\\acmJournal}[1]{\\gdef\\acm@conference{#1}}
\\newcommand{\\setcopyright}[1]{}
\\newcommand{\\acmDOI}[1]{}
\\newcommand{\\acmISBN}[1]{}
\\newcommand{\\acmYear}[1]{}
\\newcommand{\\orcid}[1]{}

\\newcommand{\\institution}[1]{#1}
\\newcommand{\\department}[1]{#1, }
\\newcommand{\\streetaddress}[1]{#1, }
\\newcommand{\\city}[1]{#1, }
\\newcommand{\\state}[1]{#1 }
\\newcommand{\\postcode}[1]{#1 }
\\newcommand{\\country}[1]{#1}

\\renewcommand{\\author}[1]{%
  \\ifacm@firstauthor
    \\acm@firstauthorfalse
    \\gdef\\acm@authors{#1}%
  \\else
    \\g@addto@macro\\acm@authors{, #1}%
  \\fi
}

\\newcommand{\\affiliation}[1]{%
  \\ifx\\acm@affils\\@empty
    \\gdef\\acm@affils{#1}%
  \\else
    \\g@addto@macro\\acm@affils{\\\\ #1}%
  \\fi
}

\\newcommand{\\email}[1]{%
  \\ifacm@firstemail
    \\acm@firstemailfalse
    \\gdef\\acm@emails{\\texttt{#1}}%
  \\else
    \\g@addto@macro\\acm@emails{, \\texttt{#1}}%
  \\fi
}

\\newcommand{\\keywords}[1]{%
  \\ifacm@maketitle@done
    \\par\\smallskip\\noindent\\textbf{Keywords:} {\\small #1}\\par
  \\else
    \\gdef\\acm@keywords{#1}%
  \\fi
}

\\newcommand{\\ccsdesc}[2][500]{%
  \\ifacm@maketitle@done
    \\par\\smallskip\\noindent\\textbf{CCS Concepts:} {\\small #2}\\par
  \\else
    \\ifx\\acm@ccsdesc\\@empty
      \\gdef\\acm@ccsdesc{#2}%
    \\else
      \\g@addto@macro\\acm@ccsdesc{; #2}%
    \\fi
  \\fi
}

\\newenvironment{CCSXML}{\\comment}{\\endcomment}
\\newenvironment{acks}{\\section*{Acknowledgments}}{}

\\newcommand{\\acm@maketitlebody}{%
  \\noindent{\\footnotesize\\sffamily\\color{black!65}\\acm@conference}\\par
  \\vspace{0.4em}
  {\\LARGE\\sffamily\\bfseries\\raggedright\\acm@title\\par}
  \\vspace{0.6em}
  \\ifx\\acm@authors\\@empty\\else
    {\\normalsize\\bfseries\\raggedright\\acm@authors\\par}
  \\fi
  \\ifx\\acm@affils\\@empty\\else
    {\\small\\raggedright\\acm@affils\\par}
  \\fi
  \\ifx\\acm@emails\\@empty\\else
    {\\small\\raggedright\\acm@emails\\par}
  \\fi
  \\vspace{0.5em}
  \\ifx\\acm@ccsdesc\\@empty\\else
    {\\footnotesize\\noindent\\textbf{CCS Concepts:} \\acm@ccsdesc\\par}
  \\fi
  \\ifx\\acm@keywords\\@empty\\else
    {\\footnotesize\\noindent\\textbf{Keywords:} \\acm@keywords\\par}
  \\fi
  \\vspace{0.4em}
  \\noindent\\rule{\\textwidth}{0.5pt}\\par
  \\vspace{0.8em}
}

\\renewcommand{\\maketitle}{%
  \\acm@maketitle@donetrue
  \\twocolumn[\\acm@maketitlebody]%
}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\footnotesize\\sffamily\\acm@conference}
\\fancyhead[R]{\\footnotesize\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}

\\theoremstyle{plain}
\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}

\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}

\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}
`;

const SIAM_PORTABLE_STY = `\\NeedsTeXFormat{LaTeX2e}
\\ProvidesPackage{siam-portable}[2025/01/01 Portable SIAM Journal Compatibility Package]

\\RequirePackage[margin=1.05in]{geometry}
\\RequirePackage{amsmath,amssymb,amsthm}
\\RequirePackage{graphicx}
\\RequirePackage{booktabs}
\\RequirePackage{xcolor}
\\RequirePackage{fancyhdr}
\\RequirePackage[numbers,sort&compress]{natbib}
\\RequirePackage{hyperref}

\\hypersetup{
  colorlinks=true,
  linkcolor=blue!55!black,
  citecolor=blue!55!black,
  urlcolor=blue!55!black
}

\\gdef\\siam@shorttitle{SIAM Journal Manuscript}
\\gdef\\siam@shortauthors{}

\\newcommand{\\headers}[2]{\\gdef\\siam@shorttitle{#1}\\gdef\\siam@shortauthors{#2}}
\\newcommand{\\funding}[1]{\\textit{Funding:} #1}

\\newenvironment{keywords}{%
  \\par\\smallskip\\noindent\\small\\textbf{Key words.}\\ \\ignorespaces
}{\\par}

\\newenvironment{AMS}{%
  \\par\\smallskip\\noindent\\small\\textbf{MSC codes.}\\ \\ignorespaces
}{\\par}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\MakeUppercase{\\siam@shorttitle}}
\\fancyhead[R]{\\small\\siam@shortauthors\\quad\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}

\\theoremstyle{plain}
\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}

\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}

\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}
`;

const APS_PORTABLE_STY = `\\NeedsTeXFormat{LaTeX2e}
\\ProvidesPackage{aps-portable}[2025/01/01 Portable APS Physical Review Compatibility Package]

\\RequirePackage[margin=0.68in,columnsep=0.22in]{geometry}
\\RequirePackage{amsmath,amssymb,amsthm}
\\RequirePackage{bm}
\\RequirePackage{graphicx}
\\RequirePackage{booktabs}
\\RequirePackage{xcolor}
\\RequirePackage{fancyhdr}
\\RequirePackage[numbers,sort&compress]{natbib}
\\RequirePackage{hyperref}

\\hypersetup{
  colorlinks=true,
  linkcolor=blue!55!black,
  citecolor=blue!55!black,
  urlcolor=blue!55!black
}

\\gdef\\aps@title{}
\\gdef\\aps@authors{}
\\gdef\\aps@affils{}
\\gdef\\aps@emails{}
\\gdef\\aps@preprint{}
\\gdef\\aps@pacs{}
\\gdef\\aps@keywords{}
\\newif\\ifaps@firstauthor\\aps@firstauthortrue
\\newif\\ifaps@maketitle@done\\aps@maketitle@donefalse

\\renewcommand{\\title}[2][]{\\gdef\\aps@title{#2}\\gdef\\@title{#2}}
\\newcommand{\\preprint}[1]{\\gdef\\aps@preprint{#1}}

\\renewcommand{\\author}[1]{%
  \\ifaps@firstauthor
    \\aps@firstauthorfalse
    \\gdef\\aps@authors{#1}%
  \\else
    \\g@addto@macro\\aps@authors{, #1}%
  \\fi
}

\\newcommand{\\affiliation}[1]{%
  \\ifx\\aps@affils\\@empty
    \\gdef\\aps@affils{#1}%
  \\else
    \\g@addto@macro\\aps@affils{\\\\ #1}%
  \\fi
}

\\newcommand{\\email}[1]{%
  \\ifx\\aps@emails\\@empty
    \\gdef\\aps@emails{\\texttt{#1}}%
  \\else
    \\g@addto@macro\\aps@emails{, \\texttt{#1}}%
  \\fi
}

\\newcommand{\\homepage}[1]{}
\\newcommand{\\pacs}[1]{\\gdef\\aps@pacs{#1}}
\\newcommand{\\keywords}[1]{%
  \\ifaps@maketitle@done
    \\par\\smallskip\\noindent\\footnotesize\\textbf{Keywords:} #1\\par
  \\else
    \\gdef\\aps@keywords{#1}%
  \\fi
}

\\newenvironment{acknowledgments}{\\section*{Acknowledgments}}{}

\\newcommand{\\aps@maketitlebody}{%
  \\ifx\\aps@preprint\\@empty\\else
    {\\raggedleft\\small\\ttfamily\\aps@preprint\\par\\vspace{0.3em}}
  \\fi
  \\begin{center}
    {\\Large\\bfseries\\aps@title\\par}
    \\vspace{0.6em}
    \\ifx\\aps@authors\\@empty\\else
      {\\normalsize\\aps@authors\\par}
      \\vspace{0.25em}
    \\fi
    \\ifx\\aps@affils\\@empty\\else
      {\\small\\itshape\\aps@affils\\par}
    \\fi
    \\ifx\\aps@emails\\@empty\\else
      {\\footnotesize\\aps@emails\\par}
    \\fi
    \\vspace{0.25em}
    {\\small\\@date\\par}
  \\end{center}
  \\ifx\\aps@pacs\\@empty\\else
    \\begin{center}{\\footnotesize PACS numbers: \\aps@pacs}\\end{center}
  \\fi
  \\ifx\\aps@keywords\\@empty\\else
    \\begin{center}{\\footnotesize Keywords: \\aps@keywords}\\end{center}
  \\fi
  \\vspace{0.4em}
  \\noindent\\rule{\\textwidth}{0.4pt}\\par
  \\vspace{0.6em}
}

\\renewcommand{\\maketitle}{%
  \\aps@maketitle@donetrue
  \\twocolumn[\\aps@maketitlebody]%
}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot[C]{\\small\\thepage}
\\renewcommand{\\headrulewidth}{0pt}

\\theoremstyle{plain}
\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}

\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}

\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}
`;

const OXFORD_WILEY_PORTABLE_STY = `\\NeedsTeXFormat{LaTeX2e}
\\ProvidesPackage{oxford-wiley-portable}[2025/01/01 Portable Oxford/Royal Society/Wiley Mathematical Journal Package]

\\RequirePackage[margin=1in]{geometry}
\\RequirePackage{amsmath,amssymb,amsthm}
\\RequirePackage{graphicx}
\\RequirePackage{booktabs}
\\RequirePackage{xcolor}
\\RequirePackage{fancyhdr}
\\RequirePackage[numbers,sort&compress]{natbib}
\\RequirePackage{hyperref}

\\hypersetup{
  colorlinks=true,
  linkcolor=blue!55!black,
  citecolor=blue!55!black,
  urlcolor=blue!55!black
}

\\gdef\\ow@journal{Mathematical Journal Monograph}
\\gdef\\ow@affil{}
\\gdef\\ow@email{}
\\gdef\\ow@keywords{}
\\gdef\\ow@subjclass{}
\\newif\\ifow@maketitle@done\\ow@maketitle@donefalse

\\newcommand{\\journalname}[1]{\\gdef\\ow@journal{#1}}
\\newcommand{\\affiliation}[1]{\\gdef\\ow@affil{#1}}
\\newcommand{\\email}[1]{\\gdef\\ow@email{\\texttt{#1}}}

\\newcommand{\\keywords}[1]{%
  \\ifow@maketitle@done
    \\par\\smallskip\\noindent\\small\\textbf{Keywords:} #1\\par
  \\else
    \\gdef\\ow@keywords{#1}%
  \\fi
}

\\newcommand{\\subjclass}[2][2020]{%
  \\ifow@maketitle@done
    \\par\\smallskip\\noindent\\small\\textbf{#1 Mathematics Subject Classification:} #2\\par
  \\else
    \\gdef\\ow@subjclass{#2}%
  \\fi
}
\\newcommand{\\msc}[1]{\\subjclass[2020]{#1}}

\\renewcommand{\\maketitle}{%
  \\ow@maketitle@donetrue
  \\begingroup
  \\noindent{\\small\\itshape\\color{black!70}\\ow@journal\\hfill\\@date}\\par
  \\vspace{0.5em}
  {\\LARGE\\bfseries\\raggedright\\@title\\par}
  \\vspace{0.6em}
  {\\large\\raggedright\\@author\\par}
  \\vspace{0.25em}
  \\ifx\\ow@affil\\@empty\\else
    {\\small\\itshape\\raggedright\\ow@affil\\par}
  \\fi
  \\ifx\\ow@email\\@empty\\else
    {\\small\\raggedright Correspondence: \\ow@email\\par}
  \\fi
  \\vspace{0.5em}
  \\ifx\\ow@subjclass\\@empty\\else
    {\\small\\noindent\\textbf{2020 Mathematics Subject Classification:} \\ow@subjclass\\par}
  \\fi
  \\ifx\\ow@keywords\\@empty\\else
    {\\small\\noindent\\textbf{Keywords:} \\ow@keywords\\par}
  \\fi
  \\vspace{0.4em}
  \\noindent\\rule{\\textwidth}{0.5pt}\\par
  \\vspace{0.8em}
  \\endgroup
}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\itshape\\ow@journal}
\\fancyhead[R]{\\small\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}

\\theoremstyle{plain}
\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}

\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}

\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}
`;

// ---------------------------------------------------------------------------
// 8 Peer-Reviewed Publisher Templates
// ---------------------------------------------------------------------------

const ELSEVIER_MAIN = `% arcana-publisher: elsevier
\\documentclass[preprint,12pt]{elsarticle}

\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{booktabs}
\\usepackage{hyperref}

\\makeatletter
\\@ifundefined{highlights}{\\newenvironment{highlights}{\\par\\smallskip\\noindent\\textbf{Highlights}\\begin{itemize}}{\\end{itemize}}}{}
\\makeatother

\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}

\\journal{Journal of Computational and Applied Mathematics}

\\begin{document}

\\begin{frontmatter}

\\title{Preconditioned Krylov Subspace Bounds for Structured Nonsymmetric Operators}

\\author[inst1]{Elena M. Vance\\corref{cor1}}
\\ead{e.vance@university.edu}
\\cortext[cor1]{Corresponding author.}

\\address[inst1]{Department of Applied Mathematics, University of Cambridge, Cambridge CB3 0WA, United Kingdom}

\\begin{abstract}
We establish sharp convergence bounds for preconditioned generalized minimal residual iterations applied to structured nonsymmetric linear systems arising from discretizations of elliptic and transport equations. By combining spectral perturbation estimates with the numerical range of the preconditioned operator, we derive explicit residual decay rates that remain uniform under mesh refinement. Numerical experiments validate the theoretical bounds and demonstrate substantial reductions in iteration counts compared with unpreconditioned Krylov solvers~\\cite{saad1986gmres,lax1956survey}.
\\end{abstract}

\\begin{highlights}
\\item Uniform residual bounds derived for preconditioned Krylov subspace methods.
\\item Spectral stability established via field-of-values estimates under refinement.
\\item Benchmarks confirm predicted asymptotic acceleration on elliptic test problems.
\\end{highlights}

\\begin{keyword}
Krylov subspace methods \\sep preconditioning \\sep spectral stability \\sep finite differences
\\MSC[2020] 65F10 \\sep 65N12 \\sep 47A12
\\end{keyword}

\\end{frontmatter}

\\section{Introduction}
\\label{sec:intro}

Iterative solvers based on Krylov subspaces remain the workhorse for large sparse linear systems $A u = f$ generated by finite-element and finite-difference discretizations~\\cite{saad1986gmres}. Classical stability theory links discretization consistency directly to convergence~\\cite{lax1956survey}, yet fast algebraic resolution requires preconditioners whose spectral properties scale favorably with problem dimension~\\cite{bottou2018optimization}.

\\section{Main Convergence Estimate}
\\label{sec:main}

Let $A \\in \\mathbb{C}^{N \\times N}$ be invertible and let $M \\in \\mathbb{C}^{N \\times N}$ denote a right preconditioner. Define the preconditioned residual at step $m$ by $r_m = f - A u_m$ in the Krylov space $u_0 + M^{-1}\\mathcal{K}_m(A M^{-1}, r_0)$.

\\begin{theorem}[Field-of-values residual bound]
\\label{thm:fov-bound}
Suppose the numerical range $W(A M^{-1}) = \\{\\langle A M^{-1} x, x\\rangle : \\|x\\|_2 = 1\\}$ lies in the open right half-plane at distance $\\delta > 0$ from the origin and has radius $R = \\|A M^{-1}\\|_2$. Then the $m$-step GMRES residual satisfies
\\begin{equation}
\\label{eq:gmres-decay}
\\frac{\\|r_m\\|_2}{\\|r_0\\|_2} \\le \\left(1 - \\frac{\\delta^2}{R^2}\\right)^{m/2}.
\\end{equation}
\\end{theorem}

\\begin{proof}
By optimality of GMRES over monic polynomials $p_m \\in \\Pi_m$ with $p_m(0) = 1$, we have $\\|r_m\\|_2 \\le \\|p_m(A M^{-1})\\|_2 \\|r_0\\|_2$. Choosing $p_m(z) = (1 - \\alpha z)^m$ with $\\alpha = \\delta / R^2$ yields $\\|I - \\alpha A M^{-1}\\|_2^2 \\le 1 - \\delta^2 / R^2$, from which \\eqref{eq:gmres-decay} follows immediately~\\cite{saad1986gmres}.
\\end{proof}

\\begin{table}[t]
\\centering
\\caption{Iteration counts and relative residuals across mesh sizes $N$.}
\\label{tab:mesh-scaling}
\\begin{tabular}{@{}rrrr@{}}
\\toprule
$N$ & Unpreconditioned & Preconditioned & Relative Residual \\\\
\\midrule
$1{,}024$ & 84 & 14 & $1.2 \\times 10^{-10}$ \\\\
$4{,}096$ & 171 & 15 & $8.7 \\times 10^{-11}$ \\\\
$16{,}384$ & 349 & 15 & $9.4 \\times 10^{-11}$ \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\section{Conclusion}
\\label{sec:conclusion}

The bound in Theorem~\\ref{thm:fov-bound} provides an explicit spectral criterion for designing mesh-independent preconditioners. Future work extends these estimates to randomized sketching and compressed representations~\\cite{candes2006robust}.

\\section*{CRediT authorship contribution statement}
\\textbf{Elena M. Vance:} Conceptualization, Methodology, Formal analysis, Software, Writing -- original draft, Writing -- review \\& editing.

\\section*{Declaration of competing interest}
The authors declare that they have no known competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.

\\section*{Data and code availability}
All numerical scripts and benchmark tables supporting the findings of this study are reproducible from the archived manuscript sources.

\\section*{Declaration of generative AI and AI-assisted technologies in the writing process}
During the preparation of this work, any AI-assisted editorial tooling was used strictly for language clarity and formatting verification under full author oversight; the authors take full responsibility for the content of the publication.

\\bibliographystyle{elsarticle-num}
\\bibliography{references}

\\end{document}
`;

const IEEE_MAIN = `% arcana-publisher: ieee
\\documentclass[journal]{IEEEtran}

\\let\\proof\\relax
\\let\\endproof\\relax
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{booktabs}
\\usepackage{cite}
\\usepackage{hyperref}

\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}

\\markboth{IEEE Transactions on Signal Processing,~Vol.~73, No.~4, April~2025}%
{Vance: Compressed Recovery via Preconditioned First-Order Splitting}

\\begin{document}

\\title{Stable Signal Recovery Under Structured Subsampling and Nonsmooth Regularization}

\\author{Elena~M.~Vance,~\\IEEEmembership{Senior~Member,~IEEE}%
\\thanks{E.~M.~Vance is with the Department of Electrical and Computer Engineering, University of Cambridge, Cambridge CB3 0WA, U.K. (e-mail: e.vance@university.edu).}}

\\maketitle

\\begin{abstract}
We investigate exact and stable reconstruction of sparse signals from underdetermined linear measurements subject to bounded adversarial noise. By establishing a restricted isometry bound for structured sensing operators, we prove linear convergence of a preconditioned proximal-gradient scheme with explicit step-size guarantees. Simulation results confirm robust phase-transition behavior matching classical compressed sensing theory.
\\end{abstract}

\\begin{IEEEkeywords}
Compressed sensing, convex optimization, proximal algorithms, restricted isometry property, signal recovery.
\\end{IEEEkeywords}

\\section{Introduction}
\\IEEEPARstart{S}{parse} recovery from incomplete linear measurements sits at the foundation of modern array processing, medical imaging, and high-dimensional statistical estimation~\\cite{candes2006robust,donoho2006compressed}. Consider the measurement model
\\begin{equation}
\\label{eq:model}
y = \\Phi x^{\\star} + w, \\qquad \\|w\\|_2 \\le \\varepsilon,
\\end{equation}
where $\\Phi \\in \\mathbb{R}^{m \\times n}$ with $m \\ll n$ and $x^{\\star}$ is $s$-sparse. First-order optimization algorithms achieve scalable reconstruction when step sizes reflect the local curvature of the forward operator~\\cite{bottou2018optimization}.

\\section{Theoretical Guarantees}
\\label{sec:theory}

\\begin{theorem}[Stable sparse recovery]
\\label{thm:recovery}
Assume $\\Phi$ satisfies the restricted isometry property of order $2s$ with constant $\\delta_{2s} < \\sqrt{2} - 1$. Then any minimizer $\\hat{x}$ of the $\\ell_1$-regularized program $\\min_x \\|x\\|_1$ subject to $\\|\\Phi x - y\\|_2 \\le \\varepsilon$ obeys
\\begin{equation}
\\label{eq:rip-bound}
\\|\\hat{x} - x^{\\star}\\|_2 \\le C_0 \\frac{\\|x^{\\star} - x^{\\star}_s\\|_1}{\\sqrt{s}} + C_1 \\varepsilon,
\\end{equation}
for universal constants $C_0, C_1 > 0$ depending only on $\\delta_{2s}$.
\\end{theorem}

\\begin{proof}
Decomposing the error $h = \\hat{x} - x^{\\star}$ over index blocks of size $s$ sorted by magnitude and applying the restricted isometry inequality together with the cone constraint $\\|h_{T^c}\\|_1 \\le \\|h_T\\|_1 + 2\\|x^{\\star}_{T^c}\\|_1$ yields \\eqref{eq:rip-bound}~\\cite{candes2006robust,donoho2006compressed}.
\\end{proof}

\\begin{table}[t]
\\centering
\\caption{Reconstruction SNR (dB) across sampling ratios $m/n$.}
\\label{tab:snr}
\\begin{tabular}{@{}ccc@{}}
\\toprule
Sampling Ratio $m/n$ & Standard Lasso & Preconditioned FISTA \\\\
\\midrule
0.20 & 21.4 & 24.8 \\\\
0.35 & 33.1 & 36.9 \\\\
0.50 & 44.6 & 47.2 \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\section{Conclusion}
We presented a unified stability analysis for structured subsampling operators and verified linear iteration complexity on noisy recovery benchmarks.

\\section*{Data and Code Availability}
All simulation scripts and datasets supporting this study are available from the authors upon reasonable request.

\\section*{Generative AI and Ethics Disclosure}
All mathematical proofs, experimental metrics, and references were verified solely by the authors; no generative AI tools were used to fabricate results or citations.

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`;

const SPRINGER_MAIN = `% arcana-publisher: springer-nature
\\documentclass[11pt,a4paper]{article}

\\usepackage{sn-jnl-portable}

\\articletype{Research Article}
\\jyear{2025}

\\title[Variance-Reduced Stochastic Optimization]{Variance-Reduced First-Order Dynamics for Nonconvex Empirical Risk Minimization}

\\author*[1]{\\fnm{Elena M.} \\sur{Vance}}\\email{e.vance@university.edu}
\\author[2]{\\fnm{Marcus} \\sur{Chen}}\\email{m.chen@institute.org}

\\affil*[1]{\\orgdiv{Department of Applied Mathematics}, \\orgname{University of Cambridge}, \\orgaddress{\\city{Cambridge}, \\country{United Kingdom}}}
\\affil[2]{\\orgdiv{Center for Data Science}, \\orgname{ETH Zurich}, \\orgaddress{\\city{Zurich}, \\country{Switzerland}}}

\\abstract{We analyze a continuous-time and discrete-time variance-reduced gradient flow for finite-sum optimization problems satisfying the Polyak--{\\L}ojasiewicz inequality. Under standard Lipschitz smoothness of component objectives, we establish global linear convergence without strong convexity of individual summands. Numerical benchmarks on large-scale regression and sparse recovery tasks confirm the sharpness of the derived Lyapunov contraction rate.}

\\keywords{Stochastic optimization, variance reduction, Lyapunov stability, gradient flows}
\\pacs[MSC Classification]{90C25, 65K05, 68Q25}

\\begin{document}

\\maketitle

\\section{Introduction}
\\label{sec:intro}

Large-scale statistical learning and inverse problems require minimizing empirical averages of the form
\\begin{equation}
\\label{eq:erm}
\\min_{x \\in \\mathbb{R}^d} \\; F(x) := \\frac{1}{n}\\sum_{i=1}^{n} f_i(x),
\\end{equation}
where evaluating the full gradient $\\nabla F(x)$ at every step is computationally prohibitive~\\cite{bottou2018optimization}. Classical Krylov and compressed sensing formulations~\\cite{saad1986gmres,candes2006robust} highlight the interplay between conditioning and step-size selection.

\\section{Convergence Analysis}
\\label{sec:analysis}

\\begin{theorem}[Lyapunov contraction]
\\label{thm:lyapunov}
Suppose each $f_i$ has $L$-Lipschitz continuous gradient and $F$ satisfies the $\\mu$-Polyak--{\\L}ojasiewicz condition $\\|\\nabla F(x)\\|_2^2 \\ge 2\\mu(F(x) - F^{\\star})$. With step size $\\eta = (4L)^{-1}$, the variance-reduced iterates satisfy
\\begin{equation}
\\label{eq:pl-rate}
\\mathbb{E}[F(x_k) - F^{\\star}] \\le \\left(1 - \\frac{\\mu}{8L}\\right)^k \\bigl(F(x_0) - F^{\\star}\\bigr).
\\end{equation}
\\end{theorem}

\\begin{proof}
Construct the augmented Lyapunov functional $\\mathcal{L}_k = F(x_k) - F^{\\star} + c_k \\sigma_k^2$, where $\\sigma_k^2$ tracks the gradient estimator variance. Combining the descent lemma with the Polyak--{\\L}ojasiewicz inequality cancels the variance error term and yields \\eqref{eq:pl-rate}~\\cite{bottou2018optimization}.
\\end{proof}

\\begin{table}[htbp]
\\centering
\\caption{Empirical epoch complexity to reach $\\|\\nabla F(x_k)\\|_2 \\le 10^{-6}$.}
\\label{tab:epochs}
\\begin{tabular}{@{}lrrr@{}}
\\toprule
Method & Condition Number $\\kappa=10^2$ & $\\kappa=10^3$ & Wall Time (s) \\\\
\\midrule
SGD (diminishing) & 412 & 2{,}890 & 14.3 \\\\
Variance-Reduced & 28 & 94 & 1.8 \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\bmhead{Declarations}
\\textbf{Funding:} This work was supported by foundational institutional research grants. \\textbf{Competing interests:} The authors declare no competing interests. \\textbf{Data availability:} All numerical scripts are self-contained and reproducible. \\textbf{Generative AI disclosure:} All analytical proofs, experiments, and references were created and verified by the authors.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;

const AMS_MAIN = `% arcana-publisher: ams
\\documentclass[11pt,reqno]{amsart}

\\usepackage{amssymb,booktabs,hyperref}

\\numberwithin{equation}{section}

\\theoremstyle{plain}
\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}

\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}

\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}

\\begin{document}

\\title[Spectral Stability of Difference Operators]{Spectral Stability and Resolvent Estimates for Discrete Differential Operators}

\\author{Elena M. Vance}
\\address{Department of Pure Mathematics, University of Cambridge, Cambridge CB3 0WA, United Kingdom}
\\email{e.vance@university.edu}

\\subjclass[2020]{65M12, 47B39, 35P05}
\\keywords{Finite difference operators, Lax--Richtmyer equivalence, resolvent bounds, Krylov approximation}

\\begin{abstract}
We prove quantitative resolvent bounds for a class of nonselfadjoint difference operators on uniform and graded grids. By refining the classical Lax--Richtmyer stability framework with discrete energy multipliers, we obtain sharp spectral enclosure regions that govern both time-stepping stability and Krylov subspace convergence rates.
\\end{abstract}

\\maketitle

\\section{Introduction}
\\label{sec:intro}

The Lax--Richtmyer equivalence theorem asserts that for consistent linear finite-difference approximations of well-posed initial-value problems, stability is both necessary and sufficient for convergence~\\cite{lax1956survey}. In modern large-scale computations, however, time-implicit discretizations yield nonsymmetric algebraic operators whose spectral properties determine the efficiency of iterative solvers~\\cite{saad1986gmres}.

\\section{Resolvent and Energy Estimates}
\\label{sec:estimates}

Let $L_h$ denote the spatial difference operator on a mesh of step size $h > 0$ equipped with the discrete $\\ell_h^2$ inner product $\\langle u, v \\rangle_h = h \\sum_j u_j \\overline{v_j}$.

\\begin{definition}
\\label{def:dissipative}
An operator $L_h$ is said to be $\\alpha$-dissipative if $\\operatorname{Re}\\langle L_h u, u \\rangle_h \\le -\\alpha \\|u\\|_h^2$ for all grid functions $u$ in its domain.
\\end{definition}

\\begin{theorem}[Quantitative resolvent bound]
\\label{thm:resolvent}
Suppose $L_h$ is $\\alpha$-dissipative with $\\alpha > 0$. Then the open half-plane $\\{\\lambda \\in \\mathbb{C} : \\operatorname{Re}\\lambda > -\\alpha\\}$ lies in the resolvent set $\\rho(L_h)$, and
\\begin{equation}
\\label{eq:resolvent}
\\|(\\lambda I - L_h)^{-1}\\|_{h \\to h} \\le \\frac{1}{\\operatorname{Re}\\lambda + \\alpha}.
\\end{equation}
\\end{theorem}

\\begin{proof}
For any grid function $u$ and any $\\lambda \\in \\mathbb{C}$ with $\\operatorname{Re}\\lambda > -\\alpha$, Cauchy--Schwarz gives
\\begin{align*}
\\|(\\lambda I - L_h) u\\|_h \\|u\\|_h
&\\ge \\operatorname{Re}\\langle (\\lambda I - L_h) u, u \\rangle_h \\\\
&= (\\operatorname{Re}\\lambda)\\|u\\|_h^2 - \\operatorname{Re}\\langle L_h u, u \\rangle_h
\\ge (\\operatorname{Re}\\lambda + \\alpha)\\|u\\|_h^2.
\\end{align*}
Dividing by $\\|u\\|_h$ establishes injectivity and yields \\eqref{eq:resolvent}~\\cite{lax1956survey}.
\\end{proof}

\\section{Concluding Remarks}
\\label{sec:remarks}

Theorem~\\ref{thm:resolvent} immediately implies uniform power-boundedness for implicit Euler and Crank--Nicolson discretizations, complementing polynomial approximation results for Krylov iterations~\\cite{saad1986gmres}.

\\section*{Data availability and ethics disclosure}
No external datasets were generated or analyzed during this theoretical study. All mathematical proofs and citations were verified independently by the authors without generative AI fabrication.

\\bibliographystyle{amsplain}
\\bibliography{references}

\\end{document}
`;

const ACM_MAIN = `% arcana-publisher: acm
\\documentclass[10pt,twocolumn]{article}

\\usepackage{acm-portable}

\\acmConference[SIGMETRICS '25]{ACM SIGMETRICS International Conference}{June 2025}{Stony Brook, NY, USA}

\\title{Sublinear Sketching for Large-Scale Sparse Linear Regression}

\\author{Elena M. Vance}
\\affiliation{\\department{Department of Computer Science}\\institution{University of Cambridge}\\city{Cambridge}\\country{United Kingdom}}
\\email{e.vance@university.edu}

\\ccsdesc[500]{Theory of computation~Sketching and sampling}
\\ccsdesc[300]{Mathematics of computing~Numerical analysis}
\\keywords{Randomized linear algebra, compressed sensing, stochastic optimization, sketching}

\\begin{document}

\\maketitle

\\begin{abstract}
We present a randomized subspace embedding algorithm that reduces the sample dimension of overdetermined sparse regression systems to near-optimal logarithmic factors while preserving solution accuracy with high probability. Our analysis bridges restricted isometry guarantees from compressed sensing with variance-reduced first-order optimization, delivering an end-to-end runtime improvement on sparse telemetry benchmarks.
\\end{abstract}

\\section{Introduction}
Massive regression and signal recovery pipelines routinely encounter design matrices whose row count prohibits exact factorization~\\cite{bottou2018optimization,donoho2006compressed}. Randomized sketching projects the residual space onto a low-dimensional subspace while preserving $\\ell_2$ geometry~\\cite{candes2006robust}.

\\section{Main Embedding Theorem}
\\begin{theorem}[Subspace embedding guarantee]
\\label{thm:sketch}
Let $S \\in \\mathbb{R}^{k \\times n}$ be a subsampled randomized transform with $k = \\mathcal{O}(\\epsilon^{-2} d \\log d)$. Then with probability at least $1 - \\delta$, simultaneously for all $x \\in \\mathbb{R}^d$,
\\begin{equation}
\\label{eq:embedding}
(1 - \\epsilon)\\|A x\\|_2^2 \\le \\|S A x\\|_2^2 \\le (1 + \\epsilon)\\|A x\\|_2^2.
\\end{equation}
\\end{theorem}

\\begin{proof}
Combining a union bound over an $\\epsilon$-net of the $d$-dimensional unit sphere in $\\operatorname{range}(A)$ with Bernstein concentration yields \\eqref{eq:embedding}~\\cite{candes2006robust,donoho2006compressed}.
\\end{proof}

\\begin{table}[t]
\\centering
\\caption{Wall-clock runtime (s) and relative objective error on $10^6 \\times 256$ regression.}
\\label{tab:sketch-perf}
\\begin{tabular}{@{}lrr@{}}
\\toprule
Solver & Time (s) & Rel. Error \\\\
\\midrule
Direct QR & 18.4 & $1.1 \\times 10^{-14}$ \\\\
Sketched Precond. GMRES & 1.3 & $4.6 \\times 10^{-8}$ \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\begin{acks}
The authors thank the anonymous reviewers for constructive comments on earlier drafts of this manuscript.
\\end{acks}

\\section*{Data Availability and Generative AI Disclosure}
Benchmark implementations and evaluation artifacts are available upon request. Any generative AI assistance was limited strictly to copyediting under full author verification.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;

const SIAM_MAIN = `% arcana-publisher: siam
\\documentclass[11pt]{article}

\\usepackage{siam-portable}

\\headers{Preconditioned Krylov Convergence}{E. M. Vance}

\\title{Adaptive Preconditioning for Saddle-Point Systems in Scientific Computing%
\\thanks{Submitted to the editors. \\funding{Supported by NSF Grant DMS-2400001.}}}

\\author{Elena M. Vance\\thanks{Department of Applied Mathematics, University of Cambridge, Cambridge CB3 0WA, UK (\\texttt{e.vance@university.edu}).}}

\\date{}

\\begin{document}

\\maketitle

\\begin{abstract}
We analyze block-triangular preconditioners for large-scale nonsymmetric saddle-point systems arising in incompressible flow and PDE-constrained optimization. Using invariant subspace decompositions and GMRES polynomial bounds, we prove mesh-independent eigenvalue clustering and derive explicit minimal residual estimates.
\\end{abstract}

\\begin{keywords}
saddle-point problems, GMRES, block preconditioning, stability analysis
\\end{keywords}

\\begin{AMS}
65F08, 65F10, 65N22
\\end{AMS}

\\section{Introduction}
\\label{sec:intro}
Saddle-point linear systems lie at the core of mixed finite-element discretizations and constrained optimization solvers~\\cite{saad1986gmres,bottou2018optimization}. Ensuring uniform conditioning under discretization refinement is essential for scalable scientific computing~\\cite{lax1956survey}.

\\section{Spectral Clustering}
\\label{sec:clustering}

\\begin{theorem}[Preconditioned spectrum]
\\label{thm:siam-spec}
Let $\\mathcal{P}$ be the exact Schur-complement block-triangular preconditioner for the saddle-point matrix $\\mathcal{A}$. Then $(\\mathcal{A}\\mathcal{P}^{-1} - I)^2 = 0$, so exact preconditioned GMRES terminates in at most two iterations~\\cite{saad1986gmres}.
\\end{theorem}

\\begin{proof}
Direct block multiplication shows $\\mathcal{A}\\mathcal{P}^{-1}$ is block upper-triangular with identity blocks on the diagonal, whose minimal polynomial is $(\\lambda - 1)^2$.
\\end{proof}

\\section{Conclusion}
Approximate Schur complements retain uniform clustering and yield predictable solver runtimes across mesh refinements.

\\section*{Data availability and ethics disclosure}
All supporting code and test matrices are available from the authors upon request. All theorems, proofs, and citations were verified directly by the authors with no generative AI fabrication.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;

const APS_MAIN = `% arcana-publisher: aps
\\documentclass[twocolumn,10pt]{article}

\\usepackage{aps-portable}

\\preprint{APS/123-QED}
\\title{Compressed Tomography of High-Dimensional Quantum States via Structured Random Measurements}
\\author{Elena M. Vance}
\\email{e.vance@university.edu}
\\affiliation{Cavendish Laboratory and Department of Applied Mathematics, University of Cambridge, Cambridge CB3 0WA, United Kingdom}
\\date{\\today}
\\keywords{quantum state tomography, compressed sensing, Pauli measurements, convex optimization}

\\begin{document}

\\maketitle

\\begin{abstract}
Full reconstruction of an $n$-qubit density matrix traditionally scales exponentially with system size. By exploiting low-rank structure alongside restricted isometry guarantees for Pauli observables, we show that noisy quantum states of rank $r$ can be reliably recovered from $\\mathcal{O}(r d \\log^2 d)$ measurement settings using efficient first-order splitting.
\\end{abstract}

\\section{Introduction}
Quantum state tomography requires reconstructing a positive semidefinite unit-trace operator $\\rho \\in \\mathbb{C}^{d \\times d}$ from expectation values of local observables. Drawing directly on compressed sensing principles~\\cite{candes2006robust,donoho2006compressed}, trace-norm minimization recovers low-rank density operators with near-minimal sample complexity.

\\section{Recovery Bound}
\\begin{theorem}[Low-rank state stability]
\\label{thm:aps-tomography}
Suppose the Pauli sampling map $\\mathcal{A}$ satisfies the rank-$2r$ restricted isometry property with constant $\\delta_{2r} < 1/3$. For measurements $b = \\mathcal{A}(\\rho^{\\star}) + \\eta$ with $\\|\\eta\\|_2 \\le \\varepsilon$, the nuclear-norm estimator $\\hat{\\rho}$ satisfies
\\begin{equation}
\\label{eq:trace-bound}
\\|\\hat{\\rho} - \\rho^{\\star}\\|_F \\le C \\varepsilon,
\\end{equation}
where $C$ depends solely on $\\delta_{2r}$~\\cite{candes2006robust}.
\\end{theorem}

\\begin{proof}
Applying the matrix restricted isometry inequality to the singular-value blocks of $\\hat{\\rho} - \\rho^{\\star}$ mirrors the vector $\\ell_1$ cone argument and yields \\eqref{eq:trace-bound}.
\\end{proof}

\\begin{acknowledgments}
We gratefully acknowledge stimulating discussions on numerical optimization and iterative solvers~\\cite{bottou2018optimization,saad1986gmres}.
\\end{acknowledgments}

\\section*{Data Availability and AI Disclosure}
Data and numerical scripts supporting the findings of this study are available upon reasonable request. All derivations and citations were authored and verified by the researchers without generative AI fabrication.

\\bibliographystyle{unsrt}
\\bibliography{references}

\\end{document}
`;

const OXFORD_WILEY_MAIN = `% arcana-publisher: oxford-wiley
\\documentclass[11pt,a4paper]{article}

\\usepackage{oxford-wiley-portable}

\\journalname{IMA Journal of Numerical Analysis}

\\title{Stability and Error Propagation in High-Order Implicit--Explicit Time Integrators}
\\author{Elena M. Vance}
\\affiliation{Mathematical Institute, University of Oxford, Oxford OX2 6GG, United Kingdom}
\\email{e.vance@university.edu}
\\date{}

\\subjclass[2020]{65L06, 65M12, 65F10}
\\keywords{IMEX Runge--Kutta, stiff differential equations, Lax stability, error bounds}

\\begin{document}

\\maketitle

\\begin{abstract}
\\noindent\\textbf{Purpose.} Stiff advection--diffusion--reaction systems demand implicit--explicit (IMEX) schemes that remain stable without prohibitive nonlinear solver costs.

\\smallskip
\\noindent\\textbf{Methods.} We combine discrete energy identities with resolvent bounds for the stiff linear partition and Krylov acceleration for the implicit stage equations~\\cite{saad1986gmres}.

\\smallskip
\\noindent\\textbf{Results.} We establish unconditional step-size bounds independent of spatial stiffness and verify optimal classical order of accuracy~\\cite{lax1956survey}.

\\smallskip
\\noindent\\textbf{Conclusion.} The resulting IMEX framework enables robust long-time integration across multiscale parabolic and hyperbolic regimes.
\\end{abstract}

\\section{Introduction}
\\label{sec:intro}

Time-dependent partial differential equations coupling stiff diffusion with nonstiff transport benefit substantially from partitioned integration~\\cite{lax1956survey}. Coupling implicit linear stages with fast Krylov linear solvers yields high-order temporal accuracy at modest algebraic cost~\\cite{saad1986gmres,bottou2018optimization}.

\\section{Stability Theorem}
\\label{sec:stability}

\\begin{theorem}[Coercive IMEX stability]
\\label{thm:imex}
Assume the stiff linear part $L$ is $\\alpha$-coercive and the explicit nonlinearity $N$ is globally Lipschitz with constant $M$. For time steps $\\Delta t$ satisfying $M \\Delta t \\le \\gamma(\\alpha)$, the discrete energy $E^k = \\frac{1}{2}\\|u^k\\|_2^2$ obeys
\\begin{equation}
\\label{eq:energy-decay}
E^{k+1} \\le \\left(1 - c\\,\\alpha\\Delta t\\right) E^k + C \\Delta t\\,\\|f^k\\|_2^2.
\\end{equation}
\\end{theorem}

\\begin{proof}
Testing the stage update with $u^{k+1}$ and absorbing the explicit remainder via Young's inequality against the coercive linear dissipation yields \\eqref{eq:energy-decay}~\\cite{lax1956survey}.
\\end{proof}

\\section*{Data availability and ethics disclosure}
All analytical proofs are self-contained and reproducibility scripts are available upon request. No generative AI tools were used to generate results, proofs, or citations.

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`;

// ---------------------------------------------------------------------------
// Publisher Registry
// ---------------------------------------------------------------------------

const UNIVERSAL_SNIPPETS: PublisherSnippet[] = [
  {
    id: "theorem-proof",
    name: "Theorem & Proof",
    description:
      "Numbered theorem environment paired with a formal proof block",
    category: "theorem",
    placement: "cursor",
    snippet: `\\begin{theorem}[Main Result]
\\label{thm:result}
Let $X$ be a Banach space and $T \\colon X \\to X$ be a contraction. Then $T$ admits a unique fixed point $x^{\\star} \\in X$.
\\end{theorem}

\\begin{proof}
For any $x_0 \\in X$, the sequence $x_{k+1} = T(x_k)$ is Cauchy by the geometric contraction bound, hence converges to $x^{\\star} = T(x^{\\star})$.
\\end{proof}
`,
  },
  {
    id: "lemma-proof",
    name: "Lemma & Proof",
    description: "Auxiliary lemma with label and proof",
    category: "theorem",
    placement: "cursor",
    snippet: `\\begin{lemma}[Auxiliary Bound]
\\label{lem:bound}
For all $u, v \\in \\mathbb{R}^d$, $\\|u + v\\|_2^2 \\le 2\\|u\\|_2^2 + 2\\|v\\|_2^2$.
\\end{lemma}

\\begin{proof}
Expand $\\|u + v\\|_2^2 + \\|u - v\\|_2^2 = 2\\|u\\|_2^2 + 2\\|v\\|_2^2$ and drop the nonnegative term $\\|u - v\\|_2^2$.
\\end{proof}
`,
  },
  {
    id: "booktabs-table",
    name: "Booktabs Journal Table",
    description: "Publication-grade comparison table using booktabs rules",
    category: "table-figure",
    placement: "cursor",
    snippet: `\\begin{table}[t]
\\centering
\\caption{Quantitative comparison across benchmark configurations.}
\\label{tab:comparison}
\\begin{tabular}{@{}lrrr@{}}
\\toprule
Method & Iterations & Relative Error & Runtime (s) \\\\
\\midrule
Baseline & 142 & $3.4 \\times 10^{-5}$ & 4.21 \\\\
Proposed & 18 & $1.1 \\times 10^{-9}$ & 0.54 \\\\
\\bottomrule
\\end{tabular}
\\end{table}
`,
  },
  {
    id: "figure-star",
    name: "Two-Column Figure (figure*)",
    description:
      "Full-width spanning figure environment for two-column journals",
    category: "table-figure",
    placement: "cursor",
    snippet: `\\begin{figure*}[t]
\\centering
\\fbox{\\parbox{0.82\\textwidth}{\\centering\\vspace{2em}Placeholder for full-width figure (replace with \\texttt{\\textbackslash includegraphics[width=0.85\\textbackslash textwidth]\\{figure.pdf\\}})\\vspace{2em}}}
\\caption{Convergence trajectory across problem scales.}
\\label{fig:overview}
\\end{figure*}
`,
  },
  {
    id: "preprint-disclosure",
    name: "Prior Preprint Disclosure",
    description:
      "Clean prior-preprint disclosure for arXiv / bioRxiv deposits submitted to journals",
    category: "frontmatter",
    placement: "before-end",
    snippet: `\\section*{Prior preprint disclosure}
A preliminary preprint version of this manuscript was deposited on arXiv / bioRxiv prior to peer review. The authors confirm that this work has not been published elsewhere and is not under consideration by another peer-reviewed journal.
`,
  },
];

export const PUBLISHER_TEMPLATES: Record<PublisherId, PublisherTemplate> = {
  elsevier: {
    id: "elsevier",
    name: "Elsevier (elsarticle)",
    shortName: "Elsevier",
    publisherGroup: "Elsevier Science",
    description:
      "Preprint & final journal layout with frontmatter, highlights, MSC 2020 codes, CRediT authorship, and competing interests.",
    columns: "1-col",
    columnLabel: "1-col",
    documentClass: "elsarticle",
    recommendedBibStyle: "elsarticle-num",
    acceptedBibStyles: [
      "elsarticle-num",
      "elsarticle-num-names",
      "elsarticle-harv",
    ],
    subjectClassLabel: "MSC 2020",
    subjectClassPlaceholder: "65F10 \\sep 65N12",
    exampleJournals: [
      "J. Comput. Appl. Math.",
      "Applied Mathematics and Computation",
      "Information Sciences",
    ],
    requiresHighlights: true,
    requiresCreditStatement: true,
    requiresDeclarations: true,
    requiresPacsOrSubjectClass: true,
    mainFileName: "main.tex",
    files: [
      {
        name: "main.tex",
        path: "main.tex",
        type: "tex",
        content: ELSEVIER_MAIN,
      },
      {
        name: "references.bib",
        path: "references.bib",
        type: "tex",
        content: SHARED_REFERENCES_BIB,
      },
    ],
    snippets: [
      {
        id: "elsevier-highlights",
        name: "Elsevier Highlights",
        description: "3–5 bullet research highlights inside frontmatter",
        category: "frontmatter",
        placement: "frontmatter",
        snippet: `\\begin{highlights}
\\item Key theoretical finding established with explicit constants.
\\item Algorithmic improvement verified under mesh refinement.
\\item Reproducible empirical validation across standard benchmarks.
\\end{highlights}
`,
      },
      {
        id: "elsevier-credit",
        name: "CRediT Authorship Statement",
        description: "Mandatory Elsevier CRediT contributor roles section",
        category: "frontmatter",
        placement: "before-end",
        snippet: `\\section*{CRediT authorship contribution statement}
\\textbf{Author Name:} Conceptualization, Methodology, Formal analysis, Software, Writing -- original draft, Writing -- review \\& editing.
`,
      },
      {
        id: "elsevier-competing",
        name: "Competing Interest Declaration",
        description: "Standard Elsevier financial/personal conflict disclosure",
        category: "frontmatter",
        placement: "before-end",
        snippet: `\\section*{Declaration of competing interest}
The authors declare that they have no known competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.
`,
      },
      ...UNIVERSAL_SNIPPETS,
    ],
  },
  ieee: {
    id: "ieee",
    name: "IEEE Transactions (IEEEtran)",
    shortName: "IEEE",
    publisherGroup: "IEEE",
    description:
      "Two-column IEEE Transactions layout with running header, IEEE membership, IEEEkeywords, and drop-cap lead-in.",
    columns: "2-col",
    columnLabel: "2-col",
    documentClass: "IEEEtran",
    recommendedBibStyle: "IEEEtran",
    acceptedBibStyles: ["IEEEtran", "IEEEtranN", "IEEEtranS"],
    subjectClassLabel: "Index / Classification",
    subjectClassPlaceholder: "65F10, 94A12",
    exampleJournals: [
      "IEEE Trans. Signal Process.",
      "IEEE Trans. Inf. Theory",
      "IEEE TPAMI",
    ],
    requiresPacsOrSubjectClass: false,
    mainFileName: "main.tex",
    files: [
      { name: "main.tex", path: "main.tex", type: "tex", content: IEEE_MAIN },
      {
        name: "references.bib",
        path: "references.bib",
        type: "tex",
        content: SHARED_REFERENCES_BIB,
      },
    ],
    snippets: [
      {
        id: "ieee-biography",
        name: "IEEE Author Biography",
        description: "End-of-paper IEEEbiography block",
        category: "frontmatter",
        placement: "before-end",
        snippet: `\\begin{IEEEbiographynophoto}{Author Name}
received the Ph.D. degree in applied mathematics. Their research interests include numerical linear algebra, signal processing, and optimization.
\\end{IEEEbiographynophoto}
`,
      },
      {
        id: "ieee-keywords",
        name: "IEEEkeywords Block",
        description: "Alphabetical index terms block after abstract",
        category: "frontmatter",
        placement: "frontmatter",
        snippet: `\\begin{IEEEkeywords}
Compressed sensing, numerical optimization, spectral stability.
\\end{IEEEkeywords}
`,
      },
      ...UNIVERSAL_SNIPPETS,
    ],
  },
  "springer-nature": {
    id: "springer-nature",
    name: "Springer Nature (sn-jnl)",
    shortName: "Springer Nature",
    publisherGroup: "Springer Nature",
    description:
      "Portable Springer Nature journal layout using self-contained sn-jnl-portable.sty for zero-error compilation everywhere.",
    columns: "1-col",
    columnLabel: "1-col",
    documentClass: "article",
    recommendedBibStyle: "plain",
    acceptedBibStyles: [
      "plain",
      "unsrt",
      "sn-mathphys-num",
      "sn-basic",
      "sn-apacite",
    ],
    subjectClassLabel: "MSC Classification",
    subjectClassPlaceholder: "90C25, 65K05",
    exampleJournals: [
      "Nature Computational Science",
      "Mathematische Annalen",
      "Numerische Mathematik",
    ],
    requiresDeclarations: true,
    requiresPacsOrSubjectClass: true,
    mainFileName: "main.tex",
    files: [
      {
        name: "main.tex",
        path: "main.tex",
        type: "tex",
        content: SPRINGER_MAIN,
      },
      {
        name: "sn-jnl-portable.sty",
        path: "sn-jnl-portable.sty",
        type: "tex",
        content: SN_JNL_PORTABLE_STY,
      },
      {
        name: "references.bib",
        path: "references.bib",
        type: "tex",
        content: SHARED_REFERENCES_BIB,
      },
    ],
    snippets: [
      {
        id: "springer-declarations",
        name: "Springer Declarations",
        description:
          "Funding, competing interests, and data availability block",
        category: "frontmatter",
        placement: "before-end",
        snippet: `\\bmhead{Declarations}
\\textbf{Funding:} Supported by institutional research grants. \\textbf{Competing interests:} The authors declare no competing interests. \\textbf{Data availability:} All code and data generated during this study are included in the repository.
`,
      },
      ...UNIVERSAL_SNIPPETS,
    ],
  },
  ams: {
    id: "ams",
    name: "AMS (amsart)",
    shortName: "AMS",
    publisherGroup: "American Mathematical Society",
    description:
      "Official amsart monograph/article layout with MSC 2020 classification, section-numbered equations, and amsplain bibliography.",
    columns: "1-col",
    columnLabel: "1-col",
    documentClass: "amsart",
    recommendedBibStyle: "amsplain",
    acceptedBibStyles: ["amsplain", "amsalpha"],
    subjectClassLabel: "MSC 2020",
    subjectClassPlaceholder: "65M12, 47B39",
    exampleJournals: [
      "J. Amer. Math. Soc.",
      "Trans. Amer. Math. Soc.",
      "Math. Comp.",
    ],
    requiresPacsOrSubjectClass: true,
    mainFileName: "main.tex",
    files: [
      { name: "main.tex", path: "main.tex", type: "tex", content: AMS_MAIN },
      {
        name: "references.bib",
        path: "references.bib",
        type: "tex",
        content: SHARED_REFERENCES_BIB,
      },
    ],
    snippets: [
      {
        id: "ams-funding",
        name: "AMS Grant / MSC Note",
        description: "MSC 2020 subject class & thanks metadata",
        category: "frontmatter",
        placement: "frontmatter",
        snippet: `\\subjclass[2020]{65M12, 47B39}
\\thanks{The author was supported in part by a research fellowship.}
`,
      },
      ...UNIVERSAL_SNIPPETS,
    ],
  },
  acm: {
    id: "acm",
    name: "ACM Transactions / SIGCONF",
    shortName: "ACM",
    publisherGroup: "Association for Computing Machinery",
    description:
      "Two-column ACM layout with portable SIGCONF/Transactions macros, CCS concepts, keywords, and acknowledgments.",
    columns: "2-col",
    columnLabel: "2-col",
    documentClass: "article",
    recommendedBibStyle: "plain",
    acceptedBibStyles: ["ACM-Reference-Format", "plain"],
    subjectClassLabel: "CCS Concepts",
    subjectClassPlaceholder: "Theory of computation~Sketching and sampling",
    exampleJournals: ["J. ACM", "ACM Trans. Math. Softw.", "ACM SIGMETRICS"],
    requiresPacsOrSubjectClass: true,
    mainFileName: "main.tex",
    files: [
      { name: "main.tex", path: "main.tex", type: "tex", content: ACM_MAIN },
      {
        name: "acm-portable.sty",
        path: "acm-portable.sty",
        type: "tex",
        content: ACM_PORTABLE_STY,
      },
      {
        name: "references.bib",
        path: "references.bib",
        type: "tex",
        content: SHARED_REFERENCES_BIB,
      },
    ],
    snippets: [
      {
        id: "acm-ccs",
        name: "ACM CCS Concept & Acks",
        description: "CCS descriptor macro and acknowledgments section",
        category: "frontmatter",
        placement: "frontmatter",
        snippet: `\\ccsdesc[500]{Theory of computation~Design and analysis of algorithms}
\\begin{acks}
The authors thank the reviewers for helpful feedback.
\\end{acks}
`,
      },
      ...UNIVERSAL_SNIPPETS,
    ],
  },
  siam: {
    id: "siam",
    name: "SIAM Journals",
    shortName: "SIAM",
    publisherGroup: "Society for Industrial and Applied Mathematics",
    description:
      "SIAM Journal layout with running headers, abstract, keywords, AMS MSC block, and section-numbered theorems.",
    columns: "1-col",
    columnLabel: "1-col",
    documentClass: "article",
    recommendedBibStyle: "plain",
    acceptedBibStyles: ["siamplain", "siam", "plain"],
    subjectClassLabel: "AMS / MSC Codes",
    subjectClassPlaceholder: "65F08, 65F10",
    exampleJournals: [
      "SIAM J. Numer. Anal.",
      "SIAM J. Matrix Anal. Appl.",
      "SIAM Review",
    ],
    requiresPacsOrSubjectClass: true,
    mainFileName: "main.tex",
    files: [
      { name: "main.tex", path: "main.tex", type: "tex", content: SIAM_MAIN },
      {
        name: "siam-portable.sty",
        path: "siam-portable.sty",
        type: "tex",
        content: SIAM_PORTABLE_STY,
      },
      {
        name: "references.bib",
        path: "references.bib",
        type: "tex",
        content: SHARED_REFERENCES_BIB,
      },
    ],
    snippets: [
      {
        id: "siam-ams",
        name: "SIAM Keywords & AMS",
        description: "SIAM keywords and AMS MSC environment blocks",
        category: "frontmatter",
        placement: "frontmatter",
        snippet: `\\begin{keywords}
numerical linear algebra, preconditioning, stability
\\end{keywords}

\\begin{AMS}
65F08, 65F10, 65N22
\\end{AMS}
`,
      },
      ...UNIVERSAL_SNIPPETS,
    ],
  },
  aps: {
    id: "aps",
    name: "APS Physical Review",
    shortName: "APS / PR",
    publisherGroup: "American Physical Society",
    description:
      "Two-column Physical Review layout with portable revtex4-2 compatibility macros, affiliations, and acknowledgments.",
    columns: "2-col",
    columnLabel: "2-col",
    documentClass: "article",
    recommendedBibStyle: "unsrt",
    acceptedBibStyles: ["apsrev4-2", "apsrev4-1", "unsrt", "plain"],
    subjectClassLabel: "PACS / PhySH",
    subjectClassPlaceholder: "02.60.-x, 03.67.-a",
    exampleJournals: [
      "Phys. Rev. Lett.",
      "Phys. Rev. A / E",
      "Rev. Mod. Phys.",
    ],
    requiresPacsOrSubjectClass: false,
    mainFileName: "main.tex",
    files: [
      { name: "main.tex", path: "main.tex", type: "tex", content: APS_MAIN },
      {
        name: "aps-portable.sty",
        path: "aps-portable.sty",
        type: "tex",
        content: APS_PORTABLE_STY,
      },
      {
        name: "references.bib",
        path: "references.bib",
        type: "tex",
        content: SHARED_REFERENCES_BIB,
      },
    ],
    snippets: [
      {
        id: "aps-acknowledgments",
        name: "APS Acknowledgments",
        description: "Standard Physical Review acknowledgments environment",
        category: "frontmatter",
        placement: "before-end",
        snippet: `\\begin{acknowledgments}
The authors gratefully acknowledge support from institutional computing resources and helpful discussions with colleagues.
\\end{acknowledgments}
`,
      },
      ...UNIVERSAL_SNIPPETS,
    ],
  },
  "oxford-wiley": {
    id: "oxford-wiley",
    name: "Oxford / Royal Society / Wiley",
    shortName: "Oxford / Wiley",
    publisherGroup: "OUP · Royal Society · Wiley",
    description:
      "Single-column mathematical journal layout with structured abstract (Purpose/Methods/Results/Conclusion) and MSC 2020 codes.",
    columns: "1-col",
    columnLabel: "1-col",
    documentClass: "article",
    recommendedBibStyle: "plain",
    acceptedBibStyles: ["plain", "abbrv", "unsrt", "apalike"],
    subjectClassLabel: "MSC 2020",
    subjectClassPlaceholder: "65L06, 65M12",
    exampleJournals: [
      "IMA J. Numer. Anal.",
      "Proc. R. Soc. A",
      "Comm. Pure Appl. Math.",
    ],
    requiresPacsOrSubjectClass: true,
    mainFileName: "main.tex",
    files: [
      {
        name: "main.tex",
        path: "main.tex",
        type: "tex",
        content: OXFORD_WILEY_MAIN,
      },
      {
        name: "oxford-wiley-portable.sty",
        path: "oxford-wiley-portable.sty",
        type: "tex",
        content: OXFORD_WILEY_PORTABLE_STY,
      },
      {
        name: "references.bib",
        path: "references.bib",
        type: "tex",
        content: SHARED_REFERENCES_BIB,
      },
    ],
    snippets: [
      {
        id: "oxford-structured-abstract",
        name: "Structured Abstract",
        description:
          "Four-part Purpose / Methods / Results / Conclusion abstract",
        category: "frontmatter",
        placement: "frontmatter",
        snippet: `\\begin{abstract}
\\noindent\\textbf{Purpose.} State the core mathematical problem.

\\smallskip
\\noindent\\textbf{Methods.} Summarize the analytical or numerical framework.

\\smallskip
\\noindent\\textbf{Results.} Present the main theorems and quantitative guarantees.

\\smallskip
\\noindent\\textbf{Conclusion.} Highlight implications and future directions.
\\end{abstract}
`,
      },
      ...UNIVERSAL_SNIPPETS,
    ],
  },
};

export const PUBLISHER_LIST: PublisherTemplate[] =
  Object.values(PUBLISHER_TEMPLATES);

// ---------------------------------------------------------------------------
// Publisher Detection
// ---------------------------------------------------------------------------

/**
 * Detects the academic publisher template associated with a LaTeX source file.
 * Checks explicit `% arcana-publisher:` headers first, then active `\documentclass`,
 * portable compatibility packages, and characteristic macros.
 */
export function detectPublisherFromContent(
  content: string,
): PublisherTemplate | null {
  if (!content) return null;

  const markerMatch = content.match(
    /^\s*%\s*arcana-publisher\s*:\s*([a-z0-9-]+)\b/im,
  );
  if (markerMatch) {
    const id = markerMatch[1].toLowerCase() as PublisherId;
    if (id in PUBLISHER_TEMPLATES) {
      return PUBLISHER_TEMPLATES[id];
    }
  }

  const active = maskComments(content);

  const docClassMatch = active.match(
    /\\documentclass(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/,
  );
  const docClass = docClassMatch?.[1]?.trim() ?? "";

  if (docClass === "elsarticle") return PUBLISHER_TEMPLATES.elsevier;
  if (docClass === "IEEEtran") return PUBLISHER_TEMPLATES.ieee;
  if (docClass === "sn-jnl") return PUBLISHER_TEMPLATES["springer-nature"];
  if (
    docClass === "amsart" ||
    docClass === "amsbook" ||
    docClass === "amsproc"
  ) {
    return PUBLISHER_TEMPLATES.ams;
  }
  if (docClass === "acmart") return PUBLISHER_TEMPLATES.acm;
  if (/^siamart|^siamltex/i.test(docClass)) return PUBLISHER_TEMPLATES.siam;
  if (/^revtex4/i.test(docClass)) return PUBLISHER_TEMPLATES.aps;
  if (
    /^(?:oup-authoring-template|rspa|qjmath|compositio|lms)$/i.test(docClass)
  ) {
    return PUBLISHER_TEMPLATES["oxford-wiley"];
  }

  if (/\\usepackage(?:\[[^\]]*\])?\{sn-jnl-portable\}/.test(active)) {
    return PUBLISHER_TEMPLATES["springer-nature"];
  }
  if (/\\usepackage(?:\[[^\]]*\])?\{acm-portable\}/.test(active)) {
    return PUBLISHER_TEMPLATES.acm;
  }
  if (/\\usepackage(?:\[[^\]]*\])?\{siam-portable\}/.test(active)) {
    return PUBLISHER_TEMPLATES.siam;
  }
  if (/\\usepackage(?:\[[^\]]*\])?\{aps-portable\}/.test(active)) {
    return PUBLISHER_TEMPLATES.aps;
  }
  if (/\\usepackage(?:\[[^\]]*\])?\{oxford-wiley-portable\}/.test(active)) {
    return PUBLISHER_TEMPLATES["oxford-wiley"];
  }

  // Characteristic publisher macros
  if (
    /\\begin\{frontmatter\}/.test(active) ||
    /\\begin\{highlights\}/.test(active) ||
    /\\MSC(?:\[\d{4}\])?\b/.test(active)
  ) {
    return PUBLISHER_TEMPLATES.elsevier;
  }
  if (
    /\\begin\{IEEEkeywords\}/.test(active) ||
    /\\IEEEPARstart\b/.test(active) ||
    /\\IEEEmembership\b/.test(active)
  ) {
    return PUBLISHER_TEMPLATES.ieee;
  }
  if (
    /\\fnm\s*\{/.test(active) ||
    /\\sur\s*\{/.test(active) ||
    /\\pacs\s*\[[^\]]*MSC/i.test(active)
  ) {
    return PUBLISHER_TEMPLATES["springer-nature"];
  }
  if (
    /\\ccsdesc(?:\[\d+\])?\s*\{/.test(active) ||
    /\\begin\{CCSXML\}/.test(active)
  ) {
    return PUBLISHER_TEMPLATES.acm;
  }
  if (/\\begin\{AMS\}/.test(active)) {
    return PUBLISHER_TEMPLATES.siam;
  }
  if (/\\journalname\s*\{/.test(active) || /\\msc\s*\{/.test(active)) {
    return PUBLISHER_TEMPLATES["oxford-wiley"];
  }
  if (/\\subjclass(?:\[\d{4}\])?\s*\{/.test(active)) {
    return PUBLISHER_TEMPLATES.ams;
  }
  if (
    /\\affiliation\s*\{/.test(active) &&
    /\\pacs\s*\{|\\preprint\s*\{/.test(active)
  ) {
    return PUBLISHER_TEMPLATES.aps;
  }

  return null;
}

/**
 * Returns the recommended BibTeX style for the given LaTeX document source.
 */
export function getRecommendedBibStyleForContent(content: string): string {
  const active = maskComments(content);
  if (/\\documentclass(?:\s*\[[^\]]*\])?\s*\{acmart\}/.test(active)) {
    return "ACM-Reference-Format";
  }
  if (/\\documentclass(?:\s*\[[^\]]*\])?\s*\{revtex4/.test(active)) {
    return "apsrev4-2";
  }
  const detected = detectPublisherFromContent(content);
  return detected ? detected.recommendedBibStyle : "plain";
}

// ---------------------------------------------------------------------------
// Brace-Balanced LaTeX Extraction Helpers
// ---------------------------------------------------------------------------

interface BraceArgMatch {
  start: number;
  end: number;
  optional: string[];
  value: string;
}

function extractBalancedGroup(
  source: string,
  openIndex: number,
  openChar = "{",
  closeChar = "}",
): { value: string; end: number } | null {
  if (source[openIndex] !== openChar) return null;
  let depth = 1;
  let index = openIndex + 1;
  while (index < source.length) {
    const ch = source[index];
    if (ch === "\\") {
      index += 2;
      continue;
    }
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return {
          value: source.slice(openIndex + 1, index),
          end: index + 1,
        };
      }
    }
    index++;
  }
  return null;
}

function findCommandMatches(
  masked: string,
  original: string,
  commandName: string,
): BraceArgMatch[] {
  const results: BraceArgMatch[] = [];
  const regex = new RegExp(`\\\\${commandName}(?![A-Za-z])\\*?`, "g");
  let match: RegExpExecArray | null = regex.exec(masked);

  while (match) {
    let cursor = match.index + match[0].length;
    const optional: string[] = [];

    while (cursor < masked.length) {
      while (cursor < masked.length && /\s/.test(masked[cursor])) cursor++;
      if (masked[cursor] === "[") {
        const opt = extractBalancedGroup(masked, cursor, "[", "]");
        if (!opt) break;
        optional.push(original.slice(cursor + 1, opt.end - 1));
        cursor = opt.end;
      } else {
        break;
      }
    }

    while (cursor < masked.length && /\s/.test(masked[cursor])) cursor++;
    if (masked[cursor] === "{") {
      const arg = extractBalancedGroup(masked, cursor, "{", "}");
      if (arg) {
        results.push({
          start: match.index,
          end: arg.end,
          optional,
          value: original.slice(cursor + 1, arg.end - 1),
        });
        regex.lastIndex = arg.end;
      }
    }
    match = regex.exec(masked);
  }

  return results;
}

function extractEnvironmentBlocks(
  masked: string,
  original: string,
  envName: string,
): { start: number; end: number; inner: string }[] {
  const escaped = envName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRegex = new RegExp(`\\\\begin\\s*\\{${escaped}\\}`, "g");
  const endMarker = `\\end{${envName}}`;
  const blocks: { start: number; end: number; inner: string }[] = [];

  let match: RegExpExecArray | null = startRegex.exec(masked);
  while (match) {
    let cursor = match.index + match[0].length;
    while (cursor < masked.length && /\s/.test(masked[cursor])) cursor++;
    if (masked[cursor] === "[") {
      const opt = extractBalancedGroup(masked, cursor, "[", "]");
      if (opt) cursor = opt.end;
    }
    const endIdx = masked.indexOf(endMarker, cursor);
    if (endIdx === -1) break;
    blocks.push({
      start: match.index,
      end: endIdx + endMarker.length,
      inner: original.slice(cursor, endIdx),
    });
    startRegex.lastIndex = endIdx + endMarker.length;
    match = startRegex.exec(masked);
  }

  return blocks;
}

function stripSimpleWrapperCommands(text: string): string {
  let next = text;
  const commands = [
    "fnm",
    "sur",
    "orgdiv",
    "orgname",
    "orgaddress",
    "street",
    "city",
    "postcode",
    "state",
    "country",
    "institution",
    "department",
    "streetaddress",
  ];
  for (let pass = 0; pass < 3; pass++) {
    for (const cmd of commands) {
      const masked = maskComments(next);
      const matches = findCommandMatches(masked, next, cmd);
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        next = next.slice(0, m.start) + m.value + next.slice(m.end);
      }
    }
  }
  return next;
}

function stripCommand(text: string, commandName: string): string {
  const masked = maskComments(text);
  const matches = findCommandMatches(masked, text, commandName);
  let next = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    next = next.slice(0, m.start) + next.slice(m.end);
  }
  return next;
}

function stripCommentsText(value: string): string {
  // Replace unescaped % comments up to and including trailing newline/spaces
  // so line-continuation comments like `%\n` disappear completely.
  let out = "";
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === "\\") {
      out += ch + (value[i + 1] ?? "");
      i += 2;
    } else if (ch === "%") {
      while (i < value.length && value[i] !== "\n" && value[i] !== "\r") {
        i++;
      }
      if (value[i] === "\r") i++;
      if (value[i] === "\n") i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

function cleanAuthorEntry(raw: string): {
  name: string;
  inlineEmail: string;
  inlineAffiliation: string;
} {
  let inlineEmail = "";
  let inlineAffiliation = "";

  const uncommented = stripCommentsText(raw);
  const masked = maskComments(uncommented);
  const emailMatches = findCommandMatches(masked, uncommented, "email");
  if (emailMatches.length > 0) {
    inlineEmail = emailMatches[0].value.trim();
  }
  const thanksMatches = findCommandMatches(masked, uncommented, "thanks");
  for (const t of thanksMatches) {
    const tMail = t.value.match(
      /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/,
    );
    if (!inlineEmail && tMail) inlineEmail = tMail[1];
    const cleanedThanks = t.value
      .replace(/e-?mail\s*:\s*\S+/gi, "")
      .replace(/\\texttt\s*\{[^}]*\}/g, "")
      .replace(/^\s*[^.]+\s+is\s+with\s+(?:the\s+)?/i, "")
      .replace(/\s+/g, " ")
      .replace(/[().,;\s]+$/, "")
      .trim();
    if (!inlineAffiliation && cleanedThanks) {
      inlineAffiliation = cleanedThanks;
    }
  }

  let cleaned = stripSimpleWrapperCommands(uncommented);
  for (const drop of [
    "email",
    "ead",
    "thanks",
    "corref",
    "fnref",
    "IEEEmembership",
    "equalcont",
    "orcid",
    "inst",
  ]) {
    cleaned = stripCommand(cleaned, drop);
  }

  // Handle standard article `Author Name \\ {\small\itshape Affiliation}`
  if (cleaned.includes("\\\\")) {
    const [firstPart, ...restParts] = cleaned.split(/\\\\/);
    const restText = restParts
      .join(", ")
      .replace(
        /\\(?:small|footnotesize|itshape|em|emph|rmfamily|sffamily|bfseries|normalsize)\b/g,
        "",
      )
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!inlineAffiliation && restText) {
      inlineAffiliation = restText;
    }
    cleaned = firstPart;
  }

  const name = cleaned
    .replace(/\\and\b/g, ", ")
    .replace(/\\sep\b/g, ", ")
    .replace(/~/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return { name, inlineEmail, inlineAffiliation };
}

function cleanAffiliationValue(raw: string): string {
  const uncommented = stripCommentsText(raw);
  // Handle Elsevier `\affiliation[...]{organization={...}, city={...}, country={...}}`
  const keyValMatches = [
    ...uncommented.matchAll(
      /(?:organization|department|addressline|city|state|country)\s*=\s*\{([^}]*)\}/gi,
    ),
  ];
  if (keyValMatches.length > 0) {
    return keyValMatches
      .map((m) => m[1].trim())
      .filter(Boolean)
      .join(", ");
  }

  return stripSimpleWrapperCommands(uncommented)
    .replace(/\\\\/g, ", ")
    .replace(/~/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMetadataText(value: string): string {
  return stripCommentsText(value)
    .replace(/~/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts structured manuscript metadata and body content from a LaTeX source file.
 * Supports standard LaTeX, Elsevier, IEEE, Springer Nature, AMS, ACM, SIAM, APS,
 * and Oxford/Wiley conventions.
 */
export function extractManuscriptParts(content: string): ManuscriptParts {
  const masked = maskComments(content);

  // Title
  const titleMatches = findCommandMatches(masked, content, "title");
  const title =
    titleMatches.length > 0 ? cleanMetadataText(titleMatches[0].value) : "";

  // Authors
  const authorMatches = findCommandMatches(masked, content, "author");
  const authorNames: string[] = [];
  let email = "";
  let fallbackAffiliation = "";

  for (const m of authorMatches) {
    const parsed = cleanAuthorEntry(m.value);
    if (parsed.name) authorNames.push(parsed.name);
    if (!email && parsed.inlineEmail) email = parsed.inlineEmail;
    if (!fallbackAffiliation && parsed.inlineAffiliation) {
      fallbackAffiliation = parsed.inlineAffiliation;
    }
  }

  // Dedicated email commands
  const eadMatches = findCommandMatches(masked, content, "ead");
  if (eadMatches.length > 0) {
    email = eadMatches[0].value.trim();
  } else {
    const emailMatches = findCommandMatches(masked, content, "email");
    if (emailMatches.length > 0) {
      email = emailMatches[0].value.trim();
    }
  }

  // Affiliations
  const affilCandidates = [
    ...findCommandMatches(masked, content, "affil"),
    ...findCommandMatches(masked, content, "affiliation"),
    ...findCommandMatches(masked, content, "address"),
    ...findCommandMatches(masked, content, "institute"),
  ];
  const affiliation =
    affilCandidates.length > 0
      ? cleanAffiliationValue(affilCandidates[0].value)
      : fallbackAffiliation;

  // Abstract (environment or Springer `\abstract{...}`)
  let abstractText = "";
  const abstractEnvs = extractEnvironmentBlocks(masked, content, "abstract");
  if (abstractEnvs.length > 0) {
    abstractText = abstractEnvs[0].inner.trim();
  } else {
    const abstractCmds = findCommandMatches(masked, content, "abstract");
    if (abstractCmds.length > 0) {
      abstractText = abstractCmds[0].value.trim();
    }
  }

  // Subject classification (parse before keywords because Elsevier embeds \MSC inside keyword)
  let subjectClass = "";
  const subjMatches = [
    ...findCommandMatches(masked, content, "subjclass"),
    ...findCommandMatches(masked, content, "MSC"),
    ...findCommandMatches(masked, content, "msc"),
    ...findCommandMatches(masked, content, "pacs"),
  ];
  if (subjMatches.length > 0) {
    subjectClass = subjMatches[0].value
      .replace(/\\sep\b/g, ", ")
      .replace(/\s+/g, " ")
      .trim();
  } else {
    const bareElsevierMsc = masked.match(
      /\\(?:MSC|PACS)(?:\s*\[\d{4}\])?\s+([^\n]+)/,
    );
    if (bareElsevierMsc) {
      subjectClass = bareElsevierMsc[1]
        .replace(/\\end\{keyword\}[\s\S]*$/g, "")
        .replace(/\\sep\b/g, ", ")
        .replace(/\s+/g, " ")
        .trim();
    } else {
      const amsBlocks = extractEnvironmentBlocks(masked, content, "AMS");
      if (amsBlocks.length > 0) {
        subjectClass = amsBlocks[0].inner.replace(/\s+/g, " ").trim();
      } else {
        const ccsMatches = findCommandMatches(masked, content, "ccsdesc");
        if (ccsMatches.length > 0) {
          subjectClass = ccsMatches
            .map((m) => m.value.trim())
            .filter(Boolean)
            .join("; ");
        }
      }
    }
  }

  // Keywords
  let keywords = "";
  const kwBlocks = [
    ...extractEnvironmentBlocks(masked, content, "keyword"),
    ...extractEnvironmentBlocks(masked, content, "IEEEkeywords"),
    ...extractEnvironmentBlocks(masked, content, "keywords"),
  ];
  if (kwBlocks.length > 0) {
    let rawKw = kwBlocks[0].inner;
    rawKw = stripCommand(rawKw, "MSC");
    rawKw = stripCommand(rawKw, "PACS");
    rawKw = stripCommand(rawKw, "JEL");
    // Also remove bare `\MSC[2020] 65F10 \sep ...` trailing line inside keyword env
    rawKw = rawKw.replace(/\\(?:MSC|PACS|JEL)(?:\s*\[\d{4}\])?[\s\S]*$/m, "");
    keywords = rawKw
      .replace(/\\sep\b/g, ", ")
      .replace(/\\and\b/g, ", ")
      .replace(/\s+/g, " ")
      .replace(/^[\s,]+|[\s,.]+$/g, "")
      .trim();
  } else {
    const kwCmds = findCommandMatches(masked, content, "keywords");
    if (kwCmds.length > 0) {
      keywords = kwCmds[0].value
        .replace(/\\sep\b/g, ", ")
        .replace(/\\and\b/g, ", ")
        .replace(/\s+/g, " ")
        .replace(/^[\s,]+|[\s,.]+$/g, "")
        .trim();
    }
  }

  // Bibliography name
  let bibliographyName = "references";
  const bibMatch =
    masked.match(/\\bibliography\s*\{([^}]+)\}/) ??
    masked.match(/\\addbibresource(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/);
  if (bibMatch) {
    const first = bibMatch[1].split(",")[0]?.trim() ?? "";
    if (first) {
      bibliographyName = first.replace(/\.bib$/i, "");
    }
  }

  // Body content
  const bodyContent = extractCleanBodyContent(content, masked);

  return {
    title,
    authors: authorNames.join(", "),
    affiliation,
    email,
    abstractText,
    keywords,
    subjectClass,
    bodyContent,
    bibliographyName,
  };
}

function removeRanges(
  text: string,
  ranges: Array<{ start: number; end: number }>,
): string {
  if (ranges.length === 0) return text;
  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number }> = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }

  let out = text;
  for (let i = merged.length - 1; i >= 0; i--) {
    const r = merged[i];
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  return out;
}

function extractCleanBodyContent(content: string, masked: string): string {
  const beginMatch = masked.match(/\\begin\s*\{document\}/);
  const endIdx = masked.lastIndexOf("\\end{document}");
  const bodyStart = beginMatch
    ? (beginMatch.index ?? 0) + beginMatch[0].length
    : 0;
  const bodyEnd = endIdx !== -1 ? endIdx : content.length;

  let body = content.slice(bodyStart, bodyEnd);
  const bodyMasked = maskComments(body);

  const dropEnvs = [
    "frontmatter",
    "abstract",
    "IEEEkeywords",
    "keywords",
    "keyword",
    "highlights",
    "AMS",
    "CCSXML",
  ];
  const dropCmds = [
    "title",
    "author",
    "affil",
    "affiliation",
    "address",
    "institute",
    "email",
    "ead",
    "cortext",
    "corref",
    "date",
    "subjclass",
    "keywords",
    "ccsdesc",
    "pacs",
    "MSC",
    "msc",
    "abstract",
    "headers",
    "markboth",
    "journal",
    "journalname",
    "articletype",
    "jyear",
    "preprint",
    "acmConference",
    "acmJournal",
    "setcopyright",
    "acmDOI",
    "acmISBN",
    "acmYear",
    "bibliographystyle",
    "bibliography",
    "addbibresource",
  ];

  const ranges: Array<{ start: number; end: number }> = [];
  for (const env of dropEnvs) {
    for (const block of extractEnvironmentBlocks(bodyMasked, body, env)) {
      ranges.push({ start: block.start, end: block.end });
    }
  }
  for (const cmd of dropCmds) {
    for (const m of findCommandMatches(bodyMasked, body, cmd)) {
      ranges.push({ start: m.start, end: m.end });
    }
  }

  body = removeRanges(body, ranges);
  body = body
    .replace(/\\maketitle\b/g, "")
    .replace(/\\printbibliography\b(?:\[[^\]]*\])?/g, "");

  // Normalize publisher-specific body macros so cross-publisher conversion compiles cleanly
  body = body
    .replace(/\\IEEEPARstart\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1$2")
    .replace(/\\bmhead\s*\{([^{}]*)\}/g, "\\section*{$1}")
    .replace(/\\begin\{pf\}/g, "\\begin{proof}")
    .replace(/\\end\{pf\}/g, "\\end{proof}")
    .replace(/\\begin\{acks\}/g, "\\section*{Acknowledgments}")
    .replace(/\\end\{acks\}/g, "")
    .replace(/\\begin\{acknowledgments\}/g, "\\section*{Acknowledgments}")
    .replace(/\\end\{acknowledgments\}/g, "");

  // Collapse excessive blank lines
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// Manuscript Adaptation / Conversion Engine
// ---------------------------------------------------------------------------

const TEMPLATE_PROVIDED_PACKAGES = new Set([
  "amsmath",
  "amssymb",
  "amsthm",
  "graphicx",
  "booktabs",
  "xcolor",
  "hyperref",
  "geometry",
  "natbib",
  "cite",
  "fancyhdr",
  "lineno",
  "fontenc",
  "inputenc",
  "verbatim",
  "bm",
  "sn-jnl-portable",
  "acm-portable",
  "siam-portable",
  "aps-portable",
  "oxford-wiley-portable",
]);

const SAFE_CARRYOVER_PACKAGES = new Set([
  "enumitem",
  "mathtools",
  "siunitx",
  "algorithm",
  "algorithmic",
  "algpseudocode",
  "algorithm2e",
  "listings",
  "tikz",
  "tikz-cd",
  "pgfplots",
  "subcaption",
  "caption",
  "multirow",
  "array",
  "tabularx",
  "longtable",
  "url",
  "xurl",
  "microtype",
  "cleveref",
  "thmtools",
  "mathrsfs",
  "dsfont",
  "bbm",
  "physics",
  "braket",
  "nicefrac",
  "cancel",
  "float",
  "wrapfig",
  "epstopdf",
]);

const STANDARD_THEOREM_ENVS = new Set([
  "theorem",
  "lemma",
  "proposition",
  "corollary",
  "definition",
  "example",
  "remark",
]);

function extractCustomPreambleAdditions(content: string): {
  extraPackages: string[];
  customMacros: string[];
  customTheorems: string[];
} {
  const masked = maskComments(content);
  const beginDoc = masked.match(/\\begin\s*\{document\}/);
  const preambleEnd = beginDoc?.index ?? content.length;
  const preamble = content.slice(0, preambleEnd);
  const preambleMasked = masked.slice(0, preambleEnd);

  const extraPackages: string[] = [];
  const seenPackages = new Set<string>();
  for (const match of preambleMasked.matchAll(
    /\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/g,
  )) {
    const opts = match[1]?.trim();
    const pkgs = match[2]
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const pkg of pkgs) {
      if (TEMPLATE_PROVIDED_PACKAGES.has(pkg)) continue;
      if (!SAFE_CARRYOVER_PACKAGES.has(pkg) || seenPackages.has(pkg)) continue;
      seenPackages.add(pkg);
      extraPackages.push(
        opts ? `\\usepackage[${opts}]{${pkg}}` : `\\usepackage{${pkg}}`,
      );
    }
  }

  const customMacros: string[] = [];
  for (const line of preamble.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%")) continue;
    if (
      /^\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator)\*?\s*/.test(
        trimmed,
      ) &&
      !/\\(?:sn@|acm@|siam@|aps@|ow@)/.test(trimmed)
    ) {
      customMacros.push(trimmed);
    }
  }

  const customTheorems: string[] = [];
  for (const line of preamble.split("\n")) {
    const trimmed = line.trim();
    const thmMatch = trimmed.match(/^\\newtheorem\*?\s*\{([^}]+)\}/);
    if (thmMatch && !STANDARD_THEOREM_ENVS.has(thmMatch[1].trim())) {
      customTheorems.push(trimmed);
    }
  }

  return { extraPackages, customMacros, customTheorems };
}

function splitAuthorNames(authors: string): string[] {
  const cleaned = authors.trim();
  if (!cleaned) return ["Author Name"];
  const parts = cleaned
    .split(/\s*,\s*|\s+\band\b\s+/i)
    .map((p) => p.trim())
    .filter((p) => p && !/^et\s+al\.?$/i.test(p));
  return parts.length > 0 ? parts : ["Author Name"];
}

function splitFirstAndSurname(fullName: string): { fnm: string; sur: string } {
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length <= 1) return { fnm: fullName, sur: "" };
  return {
    fnm: tokens.slice(0, -1).join(" "),
    sur: tokens[tokens.length - 1],
  };
}

function splitKeywordsList(keywords: string): string[] {
  return keywords
    .split(/\s*[,;]\s*|\s*\\sep\s*/i)
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Adapts any existing LaTeX manuscript into the target peer-reviewed publisher's
 * document class, preamble, frontmatter, and bibliography style while preserving
 * all body sections, equations, theorems, proofs, figures, and `\cite{...}` calls.
 */
export function adaptManuscriptToPublisher(
  content: string,
  targetPublisherId: PublisherId,
  metadataOverrides?: Partial<{
    title: string;
    authors: string;
    affiliation: string;
    email: string;
    keywords: string;
    subjectClass: string;
  }>,
): {
  texContent: string;
  extraFiles: Omit<ProjectFile, "id">[];
  summary: string;
} {
  const template = PUBLISHER_TEMPLATES[targetPublisherId];
  const extracted = extractManuscriptParts(content);
  const preambleAdditions = extractCustomPreambleAdditions(content);

  const title =
    (metadataOverrides?.title ?? extracted.title).trim() ||
    "Untitled Manuscript";
  const authors =
    (metadataOverrides?.authors ?? extracted.authors).trim() || "Author Name";
  const affiliation =
    (metadataOverrides?.affiliation ?? extracted.affiliation).trim() ||
    "Department of Mathematics, University";
  const email =
    (metadataOverrides?.email ?? extracted.email).trim() ||
    "author@university.edu";
  const abstractText =
    extracted.abstractText.trim() || "Summary of main results and methodology.";
  const rawKeywords =
    (metadataOverrides?.keywords ?? extracted.keywords).trim() ||
    "numerical analysis, mathematical modeling, scientific computing";
  const subjectClass =
    (metadataOverrides?.subjectClass ?? extracted.subjectClass).trim() ||
    (targetPublisherId === "acm"
      ? "Theory of computation~Design and analysis of algorithms"
      : "65F10, 65N12");
  const bibliographyName = extracted.bibliographyName || "references";
  const body =
    extracted.bodyContent ||
    "\\section{Introduction}\n\\label{sec:intro}\n\nManuscript content goes here.";

  const authorList = splitAuthorNames(authors);
  const keywordList = splitKeywordsList(rawKeywords);
  const shortTitle =
    title.length > 56
      ? `${title.slice(0, 53).replace(/\s+\S*$/, "")}...`
      : title;

  const extraBlock = [
    ...preambleAdditions.extraPackages,
    ...preambleAdditions.customMacros,
    ...preambleAdditions.customTheorems,
  ].join("\n");
  const extraPreambleSection = extraBlock ? `\n${extraBlock}\n` : "";

  const hasInlineTheBib = /\\begin\{thebibliography\}/.test(body);
  const maskedSource = maskComments(content);
  const hasCitations =
    /\\(?:cite|parencite|textcite|autocite|footcite)[a-zA-Z]*\*?(?:\[[^\]]*\])?\s*\{/.test(
      maskComments(body),
    );
  const hadExplicitBib =
    /\\bibliography\s*\{|\\addbibresource(?:\s*\[[^\]]*\])?\s*\{/.test(
      maskedSource,
    );
  const bibTail = hasInlineTheBib
    ? ""
    : hasCitations || hadExplicitBib
      ? `\n\\bibliographystyle{${template.recommendedBibStyle}}\n\\bibliography{${bibliographyName}}\n`
      : `\n\\bibliographystyle{${template.recommendedBibStyle}}\n`;

  let texContent = "";

  switch (targetPublisherId) {
    case "elsevier": {
      const authorBlocks = authorList
        .map((name, idx) =>
          idx === 0
            ? `\\author[inst1]{${name}\\corref{cor1}}\n\\ead{${email}}\n\\cortext[cor1]{Corresponding author.}`
            : `\\author[inst1]{${name}}`,
        )
        .join("\n");
      const mscText = subjectClass
        .split(/\s*[,;]\s*/)
        .filter(Boolean)
        .join(" \\sep ");
      texContent = `% arcana-publisher: elsevier
\\documentclass[preprint,12pt]{elsarticle}

\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{booktabs}
\\usepackage{hyperref}

\\makeatletter
\\@ifundefined{highlights}{\\newenvironment{highlights}{\\par\\smallskip\\noindent\\textbf{Highlights}\\begin{itemize}}{\\end{itemize}}}{}
\\makeatother

\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}${extraPreambleSection}

\\journal{Journal of Computational and Applied Mathematics}

\\begin{document}

\\begin{frontmatter}

\\title{${title}}

${authorBlocks}

\\address[inst1]{${affiliation}}

\\begin{abstract}
${abstractText}
\\end{abstract}

\\begin{highlights}
\\item Core contribution and analytical results formulated in full generality.
\\item Quantitative stability bounds verified against standard benchmarks.
\\end{highlights}

\\begin{keyword}
${keywordList.join(" \\sep ")}
\\MSC[2020] ${mscText}
\\end{keyword}

\\end{frontmatter}

${body}
${bibTail}
\\end{document}
`;
      break;
    }

    case "ieee": {
      const ieeeAuthors = authorList
        .map((name, idx) =>
          idx === 0 ? `${name},~\\IEEEmembership{Member,~IEEE}` : name,
        )
        .join(", ");
      texContent = `% arcana-publisher: ieee
\\documentclass[journal]{IEEEtran}

\\let\\proof\\relax
\\let\\endproof\\relax
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{booktabs}
\\usepackage{cite}
\\usepackage{hyperref}

\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}${extraPreambleSection}

\\markboth{IEEE Transactions,~2025}%
{${authorList[0]}: ${shortTitle}}

\\begin{document}

\\title{${title}}

\\author{${ieeeAuthors}%
\\thanks{${authorList.join(", ")} ${authorList.length > 1 ? "are" : "is"} with ${affiliation} (e-mail: ${email}).}}

\\maketitle

\\begin{abstract}
${abstractText}
\\end{abstract}

\\begin{IEEEkeywords}
${keywordList.join(", ")}.
\\end{IEEEkeywords}

${body}
${bibTail}
\\end{document}
`;
      break;
    }

    case "springer-nature": {
      const snAuthors = authorList
        .map((name, idx) => {
          const { fnm, sur } = splitFirstAndSurname(name);
          const nameMarkup = sur
            ? `\\fnm{${fnm}} \\sur{${sur}}`
            : `\\fnm{${fnm}}`;
          return idx === 0
            ? `\\author*[1]{${nameMarkup}}\\email{${email}}`
            : `\\author[1]{${nameMarkup}}`;
        })
        .join("\n");
      texContent = `% arcana-publisher: springer-nature
\\documentclass[11pt,a4paper]{article}

\\usepackage{sn-jnl-portable}${extraPreambleSection}

\\articletype{Research Article}
\\jyear{2025}

\\title[${shortTitle}]{${title}}

${snAuthors}

\\affil*[1]{\\orgdiv{${affiliation}}}

\\abstract{${abstractText}}

\\keywords{${keywordList.join(", ")}}
\\pacs[MSC Classification]{${subjectClass}}

\\begin{document}

\\maketitle

${body}
${bibTail}
\\end{document}
`;
      break;
    }

    case "ams": {
      const amsAuthors = authorList
        .map((name, idx) =>
          idx === 0
            ? `\\author{${name}}\n\\address{${affiliation}}\n\\email{${email}}`
            : `\\author{${name}}`,
        )
        .join("\n");
      texContent = `% arcana-publisher: ams
\\documentclass[11pt,reqno]{amsart}

\\usepackage{amssymb,booktabs,hyperref}

\\numberwithin{equation}{section}

\\theoremstyle{plain}
\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}

\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}

\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}${extraPreambleSection}

\\begin{document}

\\title[${shortTitle}]{${title}}

${amsAuthors}

\\subjclass[2020]{${subjectClass}}
\\keywords{${keywordList.join(", ")}}

\\begin{abstract}
${abstractText}
\\end{abstract}

\\maketitle

${body}
${bibTail}
\\end{document}
`;
      break;
    }

    case "acm": {
      const acmAuthors = authorList
        .map((name) => `\\author{${name}}`)
        .join("\n");
      const ccsItems = subjectClass
        .split(/\s*;\s*/)
        .filter(Boolean)
        .map((c) => `\\ccsdesc[500]{${c}}`)
        .join("\n");
      texContent = `% arcana-publisher: acm
\\documentclass[10pt,twocolumn]{article}

\\usepackage{acm-portable}${extraPreambleSection}

\\acmConference[ACM Transactions]{ACM Transactions Manuscript}{2025}{New York, NY, USA}

\\title{${title}}

${acmAuthors}
\\affiliation{\\institution{${affiliation}}}
\\email{${email}}

${ccsItems}
\\keywords{${keywordList.join(", ")}}

\\begin{document}

\\maketitle

\\begin{abstract}
${abstractText}
\\end{abstract}

${body}
${bibTail}
\\end{document}
`;
      break;
    }

    case "siam": {
      const siamAuthors = authorList.join(" \\and ");
      texContent = `% arcana-publisher: siam
\\documentclass[11pt]{article}

\\usepackage{siam-portable}${extraPreambleSection}

\\headers{${shortTitle}}{${authorList[0]}}

\\title{${title}}
\\author{${siamAuthors}\\thanks{${affiliation} (\\texttt{${email}}).}}
\\date{}

\\begin{document}

\\maketitle

\\begin{abstract}
${abstractText}
\\end{abstract}

\\begin{keywords}
${keywordList.join(", ")}
\\end{keywords}

\\begin{AMS}
${subjectClass}
\\end{AMS}

${body}
${bibTail}
\\end{document}
`;
      break;
    }

    case "aps": {
      const apsAuthors = authorList
        .map((name) => `\\author{${name}}`)
        .join("\n");
      texContent = `% arcana-publisher: aps
\\documentclass[twocolumn,10pt]{article}

\\usepackage{aps-portable}${extraPreambleSection}

\\preprint{APS/Manuscript}
\\title{${title}}
${apsAuthors}
\\email{${email}}
\\affiliation{${affiliation}}
\\date{\\today}
\\keywords{${keywordList.join(", ")}}

\\begin{document}

\\maketitle

\\begin{abstract}
${abstractText}
\\end{abstract}

${body}
${bibTail}
\\end{document}
`;
      break;
    }

    case "oxford-wiley": {
      const owAuthors = authorList.join(" \\and ");
      texContent = `% arcana-publisher: oxford-wiley
\\documentclass[11pt,a4paper]{article}

\\usepackage{oxford-wiley-portable}${extraPreambleSection}

\\journalname{Mathematical Journal Monograph}

\\title{${title}}
\\author{${owAuthors}}
\\affiliation{${affiliation}}
\\email{${email}}
\\date{}

\\subjclass[2020]{${subjectClass}}
\\keywords{${keywordList.join(", ")}}

\\begin{document}

\\maketitle

\\begin{abstract}
${abstractText}
\\end{abstract}

${body}
${bibTail}
\\end{document}
`;
      break;
    }
  }

  // Companion files (style files + references.bib)
  const extraFiles = template.files.filter(
    (file) => file.path !== template.mainFileName,
  );

  const sourcePublisher = detectPublisherFromContent(content);
  const sourceLabel = sourcePublisher
    ? sourcePublisher.shortName
    : "standard LaTeX";
  const summary = `Converted from ${sourceLabel} to ${template.name} (${template.columns}, \\bibliographystyle{${template.recommendedBibStyle}}).`;

  return {
    texContent,
    extraFiles,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Live Publisher Compliance Checklist & Quick-Fix Helpers
// ---------------------------------------------------------------------------

function extractBibStyle(masked: string): string | null {
  const match = masked.match(/\\bibliographystyle\s*\{([^}]+)\}/);
  return match?.[1]?.trim() ?? null;
}

function countAbstractWords(abstractText: string): number {
  const cleaned = maskComments(abstractText).replace(/[{}]/g, " ").trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/**
 * Generates a publisher-appropriate prior-preprint disclosure notice so authors
 * depositing on arXiv, bioRxiv/medRxiv, or HAL/OSF first can submit cleanly to
 * Elsevier, IEEE, Springer Nature, ACM, AMS, SIAM, APS, or Oxford/Wiley.
 */
export function generatePreprintDisclosureSnippet(
  publisherId?: PublisherId | null,
  options?: {
    serverLabel?: string;
    preprintId?: string;
    doi?: string;
  },
): string {
  const serverLabel = options?.serverLabel?.trim() || "arXiv";
  const identifier = options?.doi?.trim()
    ? ` (DOI: ${options.doi.trim()})`
    : options?.preprintId?.trim()
      ? ` (${options.preprintId.trim()})`
      : "";
  const heading =
    publisherId === "springer-nature"
      ? "\\bmhead{Preprint disclosure}"
      : "\\section*{Prior preprint disclosure}";

  const policySuffix =
    publisherId === "ieee"
      ? " Upon acceptance, the authors will update the preprint record with the published IEEE DOI and copyright notice."
      : publisherId === "elsevier"
        ? " In accordance with Elsevier article-sharing policy, this unrefereed preprint has not been published in a peer-reviewed journal and is not under consideration elsewhere."
        : publisherId === "springer-nature"
          ? " In accordance with Springer Nature preprint policy, this work has not been published in a peer-reviewed venue."
          : publisherId === "acm"
            ? " Per ACM preprint policy, the authors retain non-exclusive preprint rights and confirm the manuscript is not under parallel peer review."
            : publisherId === "ams"
              ? " Per AMS preprint guidelines, this manuscript is submitted exclusively for peer review and has not been published elsewhere."
              : " The authors confirm that this manuscript has not been published elsewhere and is not under consideration by another peer-reviewed journal.";

  return `${heading}\nA preliminary version of this manuscript was deposited as a preprint on ${serverLabel}${identifier}.${policySuffix}\n`;
}

/**
 * Evaluates live peer-reviewed journal compliance checks for a main LaTeX
 * document against the detected (or target) publisher template.
 */
export function evaluatePublisherCompliance(
  content: string,
  files: ProjectFile[],
  publisher: PublisherTemplate | null,
): PublisherComplianceItem[] {
  const active = maskComments(content);
  const parts = extractManuscriptParts(content);
  const items: PublisherComplianceItem[] = [];
  const labelPrefix = publisher ? publisher.shortName : "Journal";

  const hasAbstract = parts.abstractText.trim().length > 0;
  items.push({
    id: "journal-abstract",
    label: "Abstract present",
    passed: hasAbstract,
    required: true,
    detail: hasAbstract
      ? "Structured or summary abstract detected."
      : `${labelPrefix} submissions require a non-empty abstract.`,
    quickFixId: hasAbstract ? undefined : "abstract",
    quickFixLabel: "Insert Abstract",
  });

  if (hasAbstract) {
    const abstractWords = countAbstractWords(parts.abstractText);
    const withinLimit = abstractWords <= 280;
    items.push({
      id: "journal-abstract-length",
      label: withinLimit
        ? "Abstract length within journal range"
        : "Abstract exceeds typical journal word limits",
      passed: withinLimit,
      required: false,
      detail: withinLimit
        ? `${abstractWords} words (common peer-reviewed journals recommend 150–250 words).`
        : `Abstract is ~${abstractWords} words; most peer-reviewed journals enforce 150–250 word limits (hard caps commonly around 250–280 words).`,
    });
  }

  const hasKeywords = parts.keywords.trim().length > 0;
  items.push({
    id: "journal-keywords",
    label: "Keywords present",
    passed: hasKeywords,
    required: true,
    detail: hasKeywords
      ? `Keywords: ${parts.keywords.slice(0, 80)}${parts.keywords.length > 80 ? "..." : ""}`
      : `${labelPrefix} expects index terms / keywords.`,
    quickFixId: hasKeywords ? undefined : "keywords",
    quickFixLabel: "Insert Keywords",
  });

  const needsSubjectClass = publisher
    ? Boolean(publisher.requiresPacsOrSubjectClass)
    : true;
  if (needsSubjectClass || parts.subjectClass.trim().length > 0) {
    const hasSubjectClass = parts.subjectClass.trim().length > 0;
    const classLabel = publisher?.subjectClassLabel ?? "Subject Classification";
    items.push({
      id: "journal-subject-class",
      label: `${classLabel} present`,
      passed: hasSubjectClass,
      required: needsSubjectClass,
      detail: hasSubjectClass
        ? `${classLabel}: ${parts.subjectClass}`
        : `Add ${classLabel} (${publisher?.subjectClassPlaceholder ?? "65F10, 41A10"}).`,
      quickFixId: hasSubjectClass ? undefined : "subject-class",
      quickFixLabel: `Insert ${classLabel}`,
    });
  }

  const foundBibStyle = extractBibStyle(active);
  const usesBiblatex = /\\usepackage(?:\[[^\]]*\])?\{[^}]*\bbiblatex\b/.test(
    active,
  );
  const hasManualBib = /\\begin\{thebibliography\}/.test(active);
  const hasBibFile = files.some((f) => f.path.toLowerCase().endsWith(".bib"));
  const recommendedStyle = publisher?.recommendedBibStyle ?? "plain";
  const bibStyleMatches = publisher
    ? Boolean(
        (foundBibStyle &&
          publisher.acceptedBibStyles.includes(foundBibStyle)) ||
          (usesBiblatex && publisher.id === "acm") ||
          hasManualBib,
      )
    : Boolean(foundBibStyle || usesBiblatex || hasManualBib);

  items.push({
    id: "journal-bibstyle",
    label: "Bibliography style matches publisher",
    passed:
      bibStyleMatches &&
      (hasBibFile || hasManualBib || !/\\bibliography\s*\{/.test(active)),
    required: true,
    detail: foundBibStyle
      ? bibStyleMatches
        ? `Using \\bibliographystyle{${foundBibStyle}}${publisher ? ` (${publisher.shortName})` : ""}.`
        : `Found \\bibliographystyle{${foundBibStyle}}; ${labelPrefix} recommends \\bibliographystyle{${recommendedStyle}}. Note: ${hasBibFile ? ".bib file attached" : "no .bib file found"}.`
      : usesBiblatex
        ? "Using biblatex bibliography configuration."
        : hasManualBib
          ? "Using inline thebibliography environment."
          : `No \\bibliographystyle found; ${labelPrefix} recommends \\bibliographystyle{${recommendedStyle}}.`,
    quickFixId:
      bibStyleMatches && hasBibFile
        ? undefined
        : !hasManualBib && !usesBiblatex
          ? "bibstyle"
          : undefined,
    quickFixLabel: `Use ${recommendedStyle}`,
  });

  if (publisher?.requiresHighlights) {
    const hasHighlights = /\\begin\{highlights\}/.test(active);
    items.push({
      id: "journal-highlights",
      label: "Elsevier Highlights block",
      passed: hasHighlights,
      required: true,
      detail: hasHighlights
        ? "Highlights bullet block is present in frontmatter."
        : "Elsevier submissions require a 3–5 bullet highlights block.",
      quickFixId: hasHighlights ? undefined : "highlights",
      quickFixLabel: "Insert Highlights",
    });
  }

  if (publisher?.requiresDeclarations || publisher?.requiresCreditStatement) {
    const hasDeclarations =
      publisher.id === "elsevier"
        ? /CRediT/i.test(active) && /competing interest/i.test(active)
        : /\\bmhead\{Declarations\}|Declarations|Competing interests/i.test(
            active,
          );
    items.push({
      id: "journal-declarations",
      label:
        publisher.id === "elsevier"
          ? "CRediT & Competing Interest statements"
          : "Declarations section",
      passed: hasDeclarations,
      required: true,
      detail: hasDeclarations
        ? "Required authorship/conflict declarations are present."
        : publisher.id === "elsevier"
          ? "Elsevier requires CRediT authorship contribution and Declaration of competing interest sections."
          : `${publisher.shortName} expects a Declarations block (Funding, Competing interests, Data availability).`,
      quickFixId: hasDeclarations ? undefined : "declarations",
      quickFixLabel:
        publisher.id === "elsevier"
          ? "Insert CRediT & Conflict"
          : "Insert Declarations",
    });
  }

  const hasDataAvailability =
    /(?:data\s*(?:and\s+code\s+)?availability|code\s+availability|availability\s+of\s+data|data\s+accessibility|reproducibility\s+package|reproducibility\s+scripts|zenodo|figshare|dryad|osf\.io|github\.com\/[^\s}]+|10\.5281\/zenodo)/i.test(
      active,
    );
  items.push({
    id: "journal-data-availability",
    label: "Data & code availability statement",
    passed: hasDataAvailability,
    required: true,
    detail: hasDataAvailability
      ? "Data and/or code availability statement detected."
      : `${labelPrefix} submissions expect an explicit Data and Code Availability statement (repository DOI or access note).`,
    quickFixId: hasDataAvailability ? undefined : "data-availability",
    quickFixLabel: "Insert Data Availability",
  });

  const hasAiDisclosure =
    /(?:generative\s+ai|ai[- ]assisted\s+technolog|large\s+language\s+model|artificial\s+intelligence\s+(?:tools?|disclosure|usage)|use\s+of\s+ai|ai\s+disclosure)/i.test(
      active,
    );
  items.push({
    id: "journal-ai-disclosure",
    label: "Generative AI & ethics disclosure",
    passed: hasAiDisclosure,
    required: true,
    detail: hasAiDisclosure
      ? "Generative AI / authorship responsibility disclosure detected."
      : `${labelPrefix} pre-submission checks expect an explicit Generative AI & ethics disclosure statement.`,
    quickFixId: hasAiDisclosure ? undefined : "ai-disclosure",
    quickFixLabel: "Insert AI Disclosure",
  });

  return items;
}

function insertBeforeMarkerOrEnd(
  content: string,
  snippet: string,
  marker: string,
  placeAfterMarker = false,
): string {
  const masked = maskComments(content);
  const idx = masked.indexOf(marker);
  if (idx !== -1) {
    const pos = placeAfterMarker ? idx + marker.length : idx;
    const prefix = content.slice(0, pos).endsWith("\n") ? "" : "\n";
    const suffix = snippet.endsWith("\n") ? "" : "\n";
    return `${content.slice(0, pos)}${prefix}${snippet}${suffix}${content.slice(pos)}`;
  }

  const endDoc = masked.lastIndexOf("\\end{document}");
  if (endDoc !== -1) {
    const prefix = content.slice(0, endDoc).endsWith("\n") ? "" : "\n";
    const suffix = snippet.endsWith("\n") ? "" : "\n";
    return `${content.slice(0, endDoc)}${prefix}${snippet}${suffix}${content.slice(endDoc)}`;
  }

  return `${content.trimEnd()}\n\n${snippet}\n`;
}

/**
 * Applies a single compliance quick-fix to a LaTeX manuscript for the given publisher.
 */
export function applyComplianceQuickFix(
  content: string,
  quickFixId: ComplianceQuickFixId,
  publisher: PublisherTemplate,
): string {
  const masked = maskComments(content);

  switch (quickFixId) {
    case "abstract": {
      if (publisher.id === "springer-nature") {
        const block =
          "\\abstract{We present our main theoretical framework, analytical guarantees, and supporting numerical experiments.}\n";
        return masked.includes("\\begin{document}")
          ? insertBeforeMarkerOrEnd(content, block, "\\begin{document}", false)
          : insertBeforeMarkerOrEnd(content, block, "\\maketitle", false);
      }
      const block =
        "\\begin{abstract}\nWe present our main theoretical framework, analytical guarantees, and supporting numerical experiments.\n\\end{abstract}\n";
      if (
        publisher.id === "elsevier" &&
        masked.includes("\\end{frontmatter}")
      ) {
        return insertBeforeMarkerOrEnd(
          content,
          block,
          "\\end{frontmatter}",
          false,
        );
      }
      if (publisher.id === "ams" && masked.includes("\\maketitle")) {
        return insertBeforeMarkerOrEnd(content, block, "\\maketitle", false);
      }
      if (masked.includes("\\maketitle")) {
        return insertBeforeMarkerOrEnd(content, block, "\\maketitle", true);
      }
      return insertBeforeMarkerOrEnd(content, block, "\\begin{document}", true);
    }

    case "keywords": {
      if (publisher.id === "elsevier") {
        const block =
          "\\begin{keyword}\nKeyword 1 \\sep Keyword 2 \\sep Keyword 3\n\\end{keyword}\n";
        return masked.includes("\\end{frontmatter}")
          ? insertBeforeMarkerOrEnd(content, block, "\\end{frontmatter}", false)
          : insertBeforeMarkerOrEnd(content, block, "\\end{abstract}", true);
      }
      if (publisher.id === "ieee") {
        const block =
          "\\begin{IEEEkeywords}\nKeyword 1, Keyword 2, Keyword 3.\n\\end{IEEEkeywords}\n";
        return masked.includes("\\end{abstract}")
          ? insertBeforeMarkerOrEnd(content, block, "\\end{abstract}", true)
          : insertBeforeMarkerOrEnd(content, block, "\\maketitle", true);
      }
      if (publisher.id === "siam") {
        const block =
          "\\begin{keywords}\nkeyword 1, keyword 2, keyword 3\n\\end{keywords}\n";
        return masked.includes("\\end{abstract}")
          ? insertBeforeMarkerOrEnd(content, block, "\\end{abstract}", true)
          : insertBeforeMarkerOrEnd(content, block, "\\maketitle", true);
      }
      const block = "\\keywords{Keyword 1, Keyword 2, Keyword 3}\n";
      if (masked.includes("\\maketitle")) {
        return insertBeforeMarkerOrEnd(content, block, "\\maketitle", false);
      }
      return insertBeforeMarkerOrEnd(
        content,
        block,
        "\\begin{document}",
        false,
      );
    }

    case "subject-class": {
      if (publisher.id === "elsevier") {
        const endKw = masked.indexOf("\\end{keyword}");
        if (endKw !== -1) {
          const prefix = content.slice(0, endKw).endsWith("\n") ? "" : "\n";
          return `${content.slice(0, endKw)}${prefix}\\MSC[2020] ${publisher.subjectClassPlaceholder}\n${content.slice(endKw)}`;
        }
        const block = `\\begin{keyword}\nKeyword 1 \\sep Keyword 2\n\\MSC[2020] ${publisher.subjectClassPlaceholder}\n\\end{keyword}\n`;
        return insertBeforeMarkerOrEnd(
          content,
          block,
          "\\end{frontmatter}",
          false,
        );
      }
      if (publisher.id === "springer-nature") {
        const block = `\\pacs[MSC Classification]{${publisher.subjectClassPlaceholder}}\n`;
        return masked.includes("\\begin{document}")
          ? insertBeforeMarkerOrEnd(content, block, "\\begin{document}", false)
          : insertBeforeMarkerOrEnd(content, block, "\\maketitle", false);
      }
      if (publisher.id === "acm") {
        const block = `\\ccsdesc[500]{${publisher.subjectClassPlaceholder}}\n`;
        return masked.includes("\\begin{document}")
          ? insertBeforeMarkerOrEnd(content, block, "\\begin{document}", false)
          : insertBeforeMarkerOrEnd(content, block, "\\maketitle", false);
      }
      if (publisher.id === "siam") {
        const block = `\\begin{AMS}\n${publisher.subjectClassPlaceholder}\n\\end{AMS}\n`;
        return masked.includes("\\end{keywords}")
          ? insertBeforeMarkerOrEnd(content, block, "\\end{keywords}", true)
          : insertBeforeMarkerOrEnd(content, block, "\\end{abstract}", true);
      }
      if (publisher.id === "aps") {
        const block = `\\pacs{${publisher.subjectClassPlaceholder}}\n`;
        return insertBeforeMarkerOrEnd(content, block, "\\maketitle", false);
      }
      const block = `\\subjclass[2020]{${publisher.subjectClassPlaceholder}}\n`;
      return masked.includes("\\maketitle")
        ? insertBeforeMarkerOrEnd(content, block, "\\maketitle", false)
        : insertBeforeMarkerOrEnd(content, block, "\\begin{document}", false);
    }

    case "bibstyle": {
      const match = masked.match(/\\bibliographystyle\s*\{[^}]*\}/);
      if (match && match.index !== undefined) {
        return (
          content.slice(0, match.index) +
          `\\bibliographystyle{${publisher.recommendedBibStyle}}` +
          content.slice(match.index + match[0].length)
        );
      }
      const hasBib = /\\bibliography\s*\{/.test(masked);
      const hasCitations =
        /\\(?:cite|parencite|textcite|autocite|footcite)[a-zA-Z]*\*?(?:\[[^\]]*\])?\s*\{/.test(
          masked,
        );
      const insertion =
        hasBib || !hasCitations
          ? `\\bibliographystyle{${publisher.recommendedBibStyle}}\n`
          : `\\bibliographystyle{${publisher.recommendedBibStyle}}\n\\bibliography{references}\n`;
      if (hasBib) {
        return insertBeforeMarkerOrEnd(
          content,
          insertion,
          "\\bibliography",
          false,
        );
      }
      return insertBeforeMarkerOrEnd(
        content,
        insertion,
        "\\end{document}",
        false,
      );
    }

    case "highlights": {
      const block =
        "\\begin{highlights}\n\\item Primary theoretical result stated clearly.\n\\item Numerical experiments confirm predicted convergence behavior.\n\\end{highlights}\n";
      if (masked.includes("\\end{abstract}")) {
        return insertBeforeMarkerOrEnd(content, block, "\\end{abstract}", true);
      }
      return insertBeforeMarkerOrEnd(
        content,
        block,
        "\\end{frontmatter}",
        false,
      );
    }

    case "declarations": {
      let block = "";
      if (publisher.id === "elsevier") {
        const parts: string[] = [];
        if (!/CRediT/i.test(masked)) {
          parts.push(
            "\\section*{CRediT authorship contribution statement}\n\\textbf{Author Name:} Conceptualization, Methodology, Formal analysis, Writing -- original draft, Writing -- review \\& editing.\n",
          );
        }
        if (!/competing interest/i.test(masked)) {
          parts.push(
            "\\section*{Declaration of competing interest}\nThe authors declare that they have no known competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.\n",
          );
        }
        block = parts.join("\n");
      } else {
        block =
          "\\bmhead{Declarations}\n\\textbf{Funding:} Supported by institutional research funds. \\textbf{Competing interests:} The authors declare no competing interests. \\textbf{Data availability:} All materials are included in the manuscript.\n";
      }
      if (!block) return content;
      if (masked.includes("\\bibliographystyle")) {
        return insertBeforeMarkerOrEnd(
          content,
          block,
          "\\bibliographystyle",
          false,
        );
      }
      return insertBeforeMarkerOrEnd(content, block, "\\end{document}", false);
    }

    case "data-availability": {
      const heading =
        publisher.id === "springer-nature"
          ? "\\bmhead{Data and code availability}"
          : "\\section*{Data and code availability}";
      const block = `${heading}\nAll data, LaTeX sources, and simulation scripts supporting the findings of this study are available from the corresponding author upon reasonable request or via the archived repository upon publication.\n`;
      if (masked.includes("\\bibliographystyle")) {
        return insertBeforeMarkerOrEnd(
          content,
          block,
          "\\bibliographystyle",
          false,
        );
      }
      if (masked.includes("\\bibliography")) {
        return insertBeforeMarkerOrEnd(content, block, "\\bibliography", false);
      }
      return insertBeforeMarkerOrEnd(content, block, "\\end{document}", false);
    }

    case "ai-disclosure": {
      const block =
        publisher.id === "elsevier"
          ? "\\section*{Declaration of generative AI and AI-assisted technologies in the writing process}\nDuring the preparation of this work, any AI-assisted editorial tooling was used strictly for language clarity and formatting verification; the authors reviewed and edited all content and take full responsibility for the publication.\n"
          : publisher.id === "springer-nature"
            ? "\\bmhead{Generative AI and ethics disclosure}\nNo generative AI tools were used to fabricate data, results, proofs, or citations; any AI-assisted language checks were reviewed by the authors, who take full responsibility for the manuscript.\n"
            : "\\section*{Generative AI and ethics disclosure}\nAll scientific claims, proofs, data, and citations are the sole responsibility of the authors. Any generative AI assistance during preparation was strictly limited to language polishing and formatting under full human oversight.\n";
      if (masked.includes("\\bibliographystyle")) {
        return insertBeforeMarkerOrEnd(
          content,
          block,
          "\\bibliographystyle",
          false,
        );
      }
      if (masked.includes("\\bibliography")) {
        return insertBeforeMarkerOrEnd(content, block, "\\bibliography", false);
      }
      return insertBeforeMarkerOrEnd(content, block, "\\end{document}", false);
    }
  }
}
