#!/usr/bin/env python3
"""Generate SDK contract exports with the repository's real Rust exporter."""
import json
import pathlib
import shutil
import subprocess
import tempfile
import uuid

root = pathlib.Path(__file__).resolve().parents[3]
sdk = root / 'sdks/csharp'
out = sdk / 'contracts'

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def uid(key):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'https://siming.dev/sdk-contract/' + key))

with tempfile.TemporaryDirectory(prefix='siming-sdk-') as temp:
    project = pathlib.Path(temp) / 'project'
    shutil.copytree(root / 'fixtures/minimal-project', project)
    source = json.loads((project / 'dialogues/intro.json').read_text())
    source['key'] = 'sdk_demo'
    source['name'] = 'SDK demo'
    source['nodes'] = []
    source['edges'] = []
    source['entryNodeId'] = uid('start')
    def node(key, kind, **data):
        source['nodes'].append({'id': uid(key), 'key': key, 'type': kind, 'position': {'x': len(source['nodes']) * 200, 'y': 100}, 'data': data})
    def edge(a, b, port='next'):
        source['edges'].append({'id': a+'-'+port+'-'+b, 'sourceNodeId': uid(a), 'targetNodeId': uid(b), 'sourcePort': port, 'targetPort': 'in'})
    node('start', 'start', hostEvents=[{'name': 'camera.prepare', 'payload': {'nested': [1, True, None]}}, {'name': 'analytics.enter', 'payload': {}}])
    node('welcome', 'dialogue', speakerId='narrator', text={'zh-CN': '欢迎使用司命。', 'en-US': 'Welcome to Siming.'}, hostEvents=[{'name':'ui.show','payload':{}}])
    node('choice', 'choice', choices=[{'id':'accept','text':{'zh-CN':'接受任务','en-US':'Accept'}}, {'id':'reject','text':{'zh-CN':'稍后再来','en-US':'Later'}}])
    node('set', 'event', event='variable.set', params={'key':'accepted','value':True})
    node('add', 'event', event='variable.add', params={'key':'score','value':2})
    node('condition', 'condition', condition={'all':[{'variable':'accepted','operator':'==','value':True}, {'any':[{'variable':'score','operator':'>=','value':2}, {'not':{'variable':'title','operator':'==','value':'hero'}}]}]})
    node('business', 'event', event='quest.begin', params={'quest':'first'}, hostEvents=[{'name':'fx.quest','payload':{}}])
    node('auto', 'dialogue', text={'zh-CN':'任务已开始。','en-US':'Quest started.'}, advancePolicy={'mode':'auto','delayMs':500})
    node('reject', 'dialogue', text={'zh-CN':'下次见。','en-US':'See you later.'})
    node('end', 'end', hostEvents=[{'name':'ui.hide','payload':{}}])
    for a,b,p in [('start','welcome','next'),('welcome','choice','next'),('choice','set','accept'),('choice','reject','reject'),('set','add','next'),('add','condition','next'),('condition','business','true'),('condition','reject','false'),('business','auto','next'),('auto','end','next'),('reject','end','next')]: edge(a,b,p)
    (project / 'dialogues/intro.json').unlink()
    write(project / 'dialogues/Chapter1/intro.json', source)
    # A separate root chunk makes eager-loading regressions observable.
    root_dialogue = json.loads((root / 'fixtures/minimal-project/dialogues/intro.json').read_text())
    root_dialogue['id'] = uid('root-dialogue')
    root_dialogue['key'] = 'root_demo'
    write(project / 'dialogues/root.json', root_dialogue)
    write(project / 'definitions/variables.json', {'schemaVersion':1,'variables':[{'id':uid(k),'key':k,'type':t,'defaultValue':v} for k,t,v in [('accepted','boolean',False),('score','number',0),('title','string','hero')]]})
    write(project / 'definitions/events.json', {'schemaVersion':1,'events':[{'id':uid('event'),'key':'quest.begin','name':{'zh-CN':'开始任务','en-US':'Begin quest'},'params':[{'key':'quest','type':'string','required':True}]}]})
    manifest = json.loads((project / '.siming/project.json').read_text())
    manifest['dialogues'] = [{'id':source['id'],'key':source['key'],'path':'dialogues/Chapter1/intro.json'}, {'id':root_dialogue['id'],'key':root_dialogue['key'],'path':'dialogues/root.json'}]
    write(project / '.siming/project.json', manifest)
    for layout in ['bundled', 'directory-chunks']:
        subprocess.run(['cargo','run','-p','siming-cli','--','export',str(project),'--output',str(out/layout),'--format','json','--layout',layout],cwd=root,check=True)
    resources = {key: json.loads((project / ('definitions/' + key + '.json')).read_text())[key] for key in ['characters', 'variables', 'events', 'tags']}
    scenarios = []
    for choice in ['accept', 'reject']:
        request = {'request': {'manifest': manifest, 'dialogue': source, 'resources': resources, 'action': {'type':'start','locale':'en-US'}}, 'choice': choice}
        reference = subprocess.run(['cargo','run','--quiet','--locked','--manifest-path',str(sdk / 'tests/RustReference/Cargo.toml'),'--target-dir',str(root / 'target')], input=json.dumps(request), text=True, capture_output=True, cwd=root, check=True)
        scenarios.append(json.loads(reference.stdout))
    write(out / 'behavior.json', {'contractVersion':1,'dialogueKey':'sdk_demo','locale':'en-US','scenarios':scenarios})
# Importable Unity sample data, always identical to the Rust-generated chunked export.
sample = sdk / 'Packages/dev.siming.sdk/Samples~/BasicDialogue/RuntimeData'
if sample.exists(): shutil.rmtree(sample)
shutil.copytree(out / 'directory-chunks', sample)
